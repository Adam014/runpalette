import { statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import process from "node:process";

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function executableAvailable(executable: string): boolean {
  if (isAbsolute(executable) || executable.includes("/") || executable.includes("\\")) {
    return isFile(executable);
  }

  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory === "") continue;
    for (const extension of extensions) {
      if (isFile(join(directory, `${executable}${extension}`))) return true;
      if (
        process.platform === "win32" &&
        isFile(join(directory, `${executable}${extension.toLowerCase()}`))
      ) {
        return true;
      }
    }
  }
  return false;
}
