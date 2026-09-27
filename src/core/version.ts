import { readFile } from "node:fs/promises";

export async function packageVersion(): Promise<string> {
  try {
    const url = new URL("../../package.json", import.meta.url);
    const parsed = JSON.parse(await readFile(url, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}
