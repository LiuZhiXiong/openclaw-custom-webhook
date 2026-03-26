import type { IncomingMessage } from "node:http";

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "BodyTooLargeError";
  }
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new BodyTooLargeError());
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
