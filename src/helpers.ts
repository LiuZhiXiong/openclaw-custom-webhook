export function chunkTextForOutbound(text: string, limit: number) {
  if (!text) return [];
  if (text.length <= limit) return [text];
  const chunks = [];
  for (let i = 0; i < text.length; i += limit) chunks.push(text.slice(i, i + limit));
  return chunks;
}

export function formatAllowFromLowercase({ allowFrom, stripPrefixRe }: any) {
  if (!allowFrom) return [];
  return allowFrom.map((x: string) => x.toLowerCase().replace(stripPrefixRe, ""));
}

export function resolveDirectDmAuthorizationOutcome({
  isGroup,
  dmPolicy,
  senderAllowedForCommands,
}: any) {
  if (isGroup) return "allowed";
  if (dmPolicy === "disabled") return "disabled";
  if (dmPolicy === "pairing" && !senderAllowedForCommands) return "unauthorized";
  return "allowed";
}

export function resolveInboundRouteEnvelopeBuilderWithRuntime({
  cfg,
  channel,
  accountId,
  peer,
  runtime,
  sessionStore,
}: any) {
  let sessionKey = accountId;
  if (peer.kind === "group") sessionKey += `-group-${peer.id}`;
  else sessionKey += `-dm-${peer.id}`;

  return {
    route: { sessionKey, accountId, agentId: "main" },
    buildEnvelope: (params: any) => {
      const storePath = `${channel}/sessions/${sessionKey}/${Date.now()}`;
      return {
        storePath,
        body: params.body,
      };
    },
  };
}
