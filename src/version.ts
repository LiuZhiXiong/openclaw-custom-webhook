import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

export const VERSION: string = pkg.version ?? "0.0.0";
