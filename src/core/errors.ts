export type RunpaletteErrorCode =
  | "ARGUMENT_INVALID"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_PATH_INVALID"
  | "MANIFEST_READ_FAILED"
  | "MANIFEST_INVALID"
  | "SCRIPTS_INVALID"
  | "CONFIG_INVALID"
  | "CONFIG_READ_FAILED"
  | "COMMAND_NOT_FOUND"
  | "COMMAND_AMBIGUOUS"
  | "WORKSPACE_NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "CONFIRMATION_REQUIRED"
  | "PACKAGE_MANAGER_NOT_FOUND"
  | "PACKAGE_MANAGER_INVALID";

export class RunpaletteError extends Error {
  readonly code: RunpaletteErrorCode;
  readonly hint: string | undefined;

  constructor(code: RunpaletteErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "RunpaletteError";
    this.code = code;
    this.hint = hint;
  }
}
