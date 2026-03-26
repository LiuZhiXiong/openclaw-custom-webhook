/** Download image attachments to temp files for the Agent vision pipeline. */

interface Attachment {
  type?: string;
  url: string;
  name?: string;
}

interface DownloadResult {
  mediaPaths: string[];
  mediaUrls: string[];
  mediaTypes: string[];
}

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

const EXT_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

export async function downloadAttachments(
  attachments: Attachment[],
  logger: Logger,
): Promise<DownloadResult> {
  const imageAttachments = attachments.filter(
    (a) => (a.type ?? "file") === "image" && a.url,
  );

  if (imageAttachments.length === 0) {
    return { mediaPaths: [], mediaUrls: [], mediaTypes: [] };
  }

  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");

  const mediaPaths: string[] = [];
  const mediaUrls: string[] = [];
  const mediaTypes: string[] = [];

  for (const attachment of imageAttachments) {
    try {
      const resp = await fetch(attachment.url);
      if (!resp.ok) {
        logger.warn(`[custom-webhook] Failed to download ${attachment.url}: ${resp.status}`);
        continue;
      }
      const contentType = resp.headers.get("content-type") ?? "image/jpeg";
      const ext = EXT_MAP[contentType] ?? ".jpg";
      const tmpFile = path.join(
        os.tmpdir(),
        `webhook-media-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
      );
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(tmpFile, buffer);

      mediaPaths.push(tmpFile);
      mediaUrls.push(attachment.url);
      mediaTypes.push(contentType);
      logger.info(`[custom-webhook] Downloaded ${attachment.url} -> ${tmpFile} (${buffer.length} bytes)`);
    } catch (err) {
      logger.warn(`[custom-webhook] Download error for ${attachment.url}: ${err}`);
    }
  }

  return { mediaPaths, mediaUrls, mediaTypes };
}

export function cleanupTempFiles(paths: string[]): void {
  if (paths.length === 0) return;
  import("node:fs")
    .then((fs) => {
      for (const p of paths) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    })
    .catch(() => {});
}
