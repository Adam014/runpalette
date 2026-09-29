import { describe, expect, test } from "bun:test";
import { completionCandidates, generateCompletion } from "../../src/cli/completion.js";
import type { CommandCatalog } from "../../src/core/model.js";

describe("shell completion", () => {
  test("generates native scripts for every documented shell", () => {
    expect(generateCompletion("bash")).toContain("complete -F _runpalette_completion runpalette");
    expect(generateCompletion("zsh")).toContain("compdef _runpalette runpalette");
    expect(generateCompletion("fish")).toContain("complete -c runpalette");
    expect(generateCompletion("powershell")).toContain("Register-ArgumentCompleter");
    for (const shell of ["bash", "zsh", "fish", "powershell"] as const) {
      expect(generateCompletion(shell)).toContain("runpalette __complete");
      expect(generateCompletion(shell)).toContain("doctor");
    }
  });

  test("returns sorted, unique command names and aliases without line-breaking values", () => {
    const command = (name: string, aliases: string[]) => ({
      id: `package:.:${name}`,
      name,
      label: name,
      aliases,
      script: name,
      group: "other",
      order: 0,
      safety: { confirmationRequired: false },
      workspace: { name: "fixture", path: ".", root: "/repo", isRoot: true },
      source: { kind: "package" as const, path: "/repo/package.json" },
      execution: { executable: "npm", args: ["run", name] },
    });
    const catalog = {
      commands: [command("test", ["check", "test"]), command("dev server", ["bad\nvalue"])],
    } as CommandCatalog;

    expect(completionCandidates(catalog)).toEqual(["check", "dev server", "test"]);
  });
});
