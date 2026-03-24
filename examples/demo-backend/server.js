import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3005;
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const RECEIVE_SECRET = process.env.RECEIVE_SECRET || 'my_super_secret_receive_token';
const PUSH_SECRET = process.env.PUSH_SECRET || 'my_super_secret_push_token';

// 存储收到的消息（用于演示）
const messageHistory = [];

// ==========================================
// 1. 接收从 OpenClaw 推送过来的 Agent 回复
// （配置在 openclaw.json 里的 pushUrl）
// ==========================================
app.post('/receive', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${PUSH_SECRET}`) {
    console.log('❌ 收到未授权推送请求');
    return res.status(401).send('Unauthorized');
  }

  const { type, senderId, chatId, reply, timestamp } = req.body;
  
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║ 🤖 收到 Agent 回复`);
  console.log(`║ 用户: ${senderId}`);
  console.log(`║ 会话: ${chatId}`);
  console.log(`║ 回复: ${reply}`);
  console.log('╚══════════════════════════════════════════════╝\n');

  messageHistory.push({
    direction: 'inbound',
    from: 'agent',
    senderId,
    chatId,
    text: reply,
    timestamp: timestamp || Date.now(),
  });

  res.status(200).json({ ok: true });
});

// ==========================================
// 2. 发送消息给 OpenClaw（通过 webhook）
// ==========================================
app.post('/send', async (req, res) => {
  const { text, senderId = 'demo_user', chatId = 'demo_chat' } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  console.log(`\n📤 发送消息给 OpenClaw: [${text}]`);

  try {
    const response = await fetch(`${OPENCLAW_URL}/api/plugins/custom-webhook/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RECEIVE_SECRET}`,
      },
      body: JSON.stringify({
        senderId,
        chatId,
        isGroup: false,
        text,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`✅ Agent 回复: ${data.reply}`);

      messageHistory.push(
        { direction: 'outbound', from: 'user', senderId, chatId, text, timestamp: Date.now() },
        { direction: 'inbound', from: 'agent', senderId, chatId, text: data.reply, timestamp: data.timestamp },
      );

      res.json({
        ok: true,
        reply: data.reply,
        timestamp: data.timestamp,
      });
    } else {
      console.log(`❌ OpenClaw 返回错误: ${response.status}`);
      res.status(response.status).json(data);
    }
  } catch (err) {
    console.log(`❌ 请求异常: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. 查看消息历史（调试用）
// ==========================================
app.get('/history', (req, res) => {
  res.json(messageHistory);
});

// ==========================================
// 4. 健康检查
// ==========================================
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║  🚀 OpenClaw Webhook Demo Backend           ║
║  Port: ${PORT}                                ║
║  OpenClaw: ${OPENCLAW_URL.padEnd(33)}║
╚══════════════════════════════════════════════╝

接口列表:
  POST /send      发送消息给 OpenClaw
  POST /receive   接收 Agent 回复（pushUrl 回调）
  GET  /history   查看消息历史
  GET  /health    健康检查

快速测试:
  curl -X POST http://localhost:${PORT}/send \\
    -H "Content-Type: application/json" \\
    -d '{"text":"你好！","senderId":"test_user","chatId":"test_chat"}'
`);
});
