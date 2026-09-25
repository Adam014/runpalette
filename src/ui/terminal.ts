import type { Preference } from "../cli/arguments.js";

export interface TerminalCapabilities {
  interactive: boolean;
  color: boolean;
  unicode: boolean;
  columns: number;
  rows: number;
}

interface TerminalStream {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
}

function supportsUnicode(environment: NodeJS.ProcessEnv): boolean {
  if (environment.TERM === "dumb") return false;
  if (process.platform === "win32") return true;
  const locale = environment.LC_ALL ?? environment.LC_CTYPE ?? environment.LANG ?? "";
  return locale === "" || /utf-?8/iu.test(locale);
}

export function terminalCapabilities(options: {
  input: TerminalStream;
  output: TerminalStream;
  environment: NodeJS.ProcessEnv;
  nonInteractive: boolean;
  color: Preference;
  unicode: Preference;
}): TerminalCapabilities {
  const interactive =
    !options.nonInteractive &&
    options.environment.TERM !== "dumb" &&
    options.input.isTTY === true &&
    options.output.isTTY === true;
  const automaticColor = interactive && options.environment.NO_COLOR === undefined;

  return {
    interactive,
    color: options.color === "always" || (options.color === "auto" && automaticColor),
    unicode:
      options.unicode === "always" ||
      (options.unicode === "auto" && supportsUnicode(options.environment)),
    columns: Math.max(20, options.output.columns ?? 80),
    rows: Math.max(10, options.output.rows ?? 24),
  };
}
