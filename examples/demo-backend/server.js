import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3005;
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const RECEIVE_SECRET = process.env.RECEIVE_SECRET || 'my_super_secret_receive_token';
const PUSH_SECRET = process.env.PUSH_SECRET || 'my_super_secret_push_token';

// 存储收到的消息（内存队列，用于演示）
const messageHistory = [];

// ==========================================
// 1. 接收从 OpenClaw 推送过来的 Agent 回复
//    配置在 openclaw.json 里的 pushUrl
//    适用于 async 模式和常规 pushUrl 回调
// ==========================================
app.post('/receive', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${PUSH_SECRET}`) {
    console.log('❌ 收到未授权推送请求');
    return res.status(401).send('Unauthorized');
  }

  const { type, senderId, chatId, reply, attachments, timestamp } = req.body;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║ 🤖 收到 Agent 回复 (${type ?? 'unknown'})`);
  console.log(`║ 用户:   ${senderId}`);
  console.log(`║ 会话:   ${chatId}`);
  console.log(`║ 回复:   ${reply}`);
  if (attachments?.length) {
    console.log(`║ 附件:   ${attachments.length} 个`);
    for (const a of attachments) {
      console.log(`║   📎 ${a.type ?? 'file'}: ${a.url}${a.text ? ` — ${a.text}` : ''}`);
    }
  }
  console.log('╚══════════════════════════════════════════════╝\n');

  messageHistory.push({
    direction: 'inbound',
    from: 'agent',
    senderId,
    chatId,
    text: reply,
    attachments: attachments ?? [],
    timestamp: timestamp || Date.now(),
  });

  res.status(200).json({ ok: true });
});

// ==========================================
// 2. 发送消息给 OpenClaw（通过 webhook）
//    支持同步 & 异步两种模式
// ==========================================
app.post('/send', async (req, res) => {
  const {
    text,
    senderId = 'demo_user',
    chatId = 'demo_chat',
    attachments,
    async: asyncMode = false,
    messageId,
  } = req.body;

  if (!text && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ error: 'text or attachments is required' });
  }

  const mode = asyncMode ? '异步' : '同步';
  console.log(`\n📤 发送消息给 OpenClaw (${mode}): [${text ?? '(media only)'}]${attachments?.length ? ` + ${attachments.length} 个附件` : ''}`);

  try {
    const payload = {
      senderId,
      chatId,
      text: text ?? '',
      isGroup: false,
      ...(asyncMode ? { async: true } : {}),
      ...(messageId ? { messageId } : {}),
      ...(attachments ? { attachments } : {}),
    };

    const response = await fetch(`${OPENCLAW_URL}/api/plugins/custom-webhook/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RECEIVE_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.status === 202) {
      // Async mode — Agent 将在后台处理，结果通过 pushUrl 推送到 /receive
      console.log(`⏳ 异步请求已接受 (messageId: ${data.messageId ?? 'N/A'})`);
      messageHistory.push({
        direction: 'outbound',
        from: 'user',
        senderId,
        chatId,
        text,
        attachments,
        async: true,
        timestamp: Date.now(),
      });
      res.json({ ok: true, async: true, messageId: data.messageId, message: 'Agent 正在处理中，结果将推送到 /receive' });
    } else if (response.ok) {
      // Sync mode — 直接收到 Agent 回复
      if (data.deduplicated) {
        console.log('🔄 重复消息，已跳过处理');
      } else {
        console.log(`✅ Agent 回复: ${data.reply}`);
        if (data.attachments?.length) {
          console.log(`📎 Agent 附件: ${data.attachments.map(a => `${a.type}: ${a.url}`).join(', ')}`);
        }
      }

      messageHistory.push(
        { direction: 'outbound', from: 'user', senderId, chatId, text, attachments, timestamp: Date.now() },
        {
          direction: 'inbound',
          from: 'agent',
          senderId,
          chatId,
          text: data.reply,
          attachments: data.attachments,
          deduplicated: data.deduplicated ?? false,
          timestamp: data.timestamp,
        },
      );

      res.json({
        ok: true,
        reply: data.reply,
        ...(data.attachments ? { attachments: data.attachments } : {}),
        ...(data.deduplicated ? { deduplicated: true } : {}),
        timestamp: data.timestamp,
      });
    } else {
      console.log(`❌ OpenClaw 返回错误: ${response.status} — ${JSON.stringify(data)}`);
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
  const limit = parseInt(req.query.limit) || 50;
  const recent = messageHistory.slice(-limit);
  res.json({ total: messageHistory.length, showing: recent.length, messages: recent });
});

// ==========================================
// 4. 清空消息历史
// ==========================================
app.delete('/history', (req, res) => {
  const count = messageHistory.length;
  messageHistory.length = 0;
  res.json({ ok: true, cleared: count });
});

// ==========================================
// 5. 健康检查
// ==========================================
app.get('/health', async (req, res) => {
  let openclawStatus = 'unknown';
  try {
    const resp = await fetch(`${OPENCLAW_URL}/api/plugins/custom-webhook/health`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json();
      openclawStatus = `ok (v${data.version}, uptime: ${Math.round(data.uptime)}s)`;
    } else {
      openclawStatus = `error (${resp.status})`;
    }
  } catch {
    openclawStatus = 'unreachable';
  }

  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    messageCount: messageHistory.length,
    openclaw: openclawStatus,
  });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║  🚀 OpenClaw Webhook Demo Backend v1.6.6   ║
║  Port: ${String(PORT).padEnd(37)}║
║  OpenClaw: ${OPENCLAW_URL.padEnd(33)}║
╚══════════════════════════════════════════════╝

接口列表:
  POST   /send      发送消息给 OpenClaw (支持 sync / async 模式)
  POST   /receive   接收 Agent 回复（pushUrl 回调）
  GET    /history   查看消息历史（?limit=N）
  DELETE /history   清空消息历史
  GET    /health    健康检查（含 OpenClaw 连通性探测）

快速测试 (同步模式):
  curl -X POST http://localhost:${PORT}/send \\
    -H "Content-Type: application/json" \\
    -d '{"text":"你好！","senderId":"test_user","chatId":"test_chat"}'

快速测试 (异步模式):
  curl -X POST http://localhost:${PORT}/send \\
    -H "Content-Type: application/json" \\
    -d '{"text":"请总结文档","senderId":"test_user","async":true}'

带图片附件:
  curl -X POST http://localhost:${PORT}/send \\
    -H "Content-Type: application/json" \\
    -d '{"text":"这张图片是什么?","senderId":"test_user","attachments":[{"type":"image","url":"https://example.com/photo.jpg"}]}'
`);
});
