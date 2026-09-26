import type { TerminalCapabilities } from "./terminal.js";

const ANSI_PATTERN =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal sanitization intentionally matches ANSI bytes.
  /[\x1B\x9B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\\/#&.:=?%@~_]+)*)?\x07)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: untrusted terminal text must not retain controls.
const CONTROL_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/gu;

export function sanitize(value: string): string {
  return value
    .replace(ANSI_PATTERN, "")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .replaceAll("\t", " ")
    .replace(CONTROL_PATTERN, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function ansi(code: string, value: string, capabilities: TerminalCapabilities): string {
  return capabilities.color ? `\u001B[${code}m${value}\u001B[0m` : value;
}

export const style = {
  accent: (value: string, capabilities: TerminalCapabilities) => ansi("36", value, capabilities),
  dim: (value: string, capabilities: TerminalCapabilities) => ansi("2", value, capabilities),
  strong: (value: string, capabilities: TerminalCapabilities) => ansi("1", value, capabilities),
  warning: (value: string, capabilities: TerminalCapabilities) => ansi("33", value, capabilities),
  failure: (value: string, capabilities: TerminalCapabilities) => ansi("31", value, capabilities),
  selected: (value: string, capabilities: TerminalCapabilities) => ansi("1;7", value, capabilities),
};

export function truncate(value: string, width: number, unicode = true): string {
  const clean = sanitize(value);
  if (clean.length <= width) return clean;
  const marker = unicode ? "…" : "...";
  if (width <= marker.length) return clean.slice(0, Math.max(0, width));
  return `${clean.slice(0, Math.max(0, width - marker.length))}${marker}`;
}

export function pad(value: string, width: number): string {
  const clean = sanitize(value);
  return clean.length >= width ? clean : `${clean}${" ".repeat(width - clean.length)}`;
}
