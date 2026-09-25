import { describe, expect, test } from "bun:test";
import type { CatalogCommand } from "../../src/core/model.js";
import { filterCommands } from "../../src/ui/search.js";

function command(name: string, script = name): CatalogCommand {
  return {
    id: `package:${name}`,
    name,
    label: name,
    aliases: [],
    script,
    group: "other",
    order: 0,
    safety: { confirmationRequired: false },
    workspace: { name: "project", path: ".", root: "/project", isRoot: true },
    source: { kind: "package.json", path: "/project/package.json" },
  };
}

describe("filterCommands", () => {
  const commands = [
    command("test:unit", "vitest run"),
    command("dev", "vite"),
    command("test:e2e", "playwright test"),
    command("database:migrate", "drizzle-kit migrate"),
  ];

  test("prioritizes exact and prefix matches while retaining stable ties", () => {
    expect(filterCommands(commands, "dev").map(({ name }) => name)).toEqual(["dev"]);
    expect(filterCommands(commands, "test").map(({ name }) => name)).toEqual([
      "test:e2e",
      "test:unit",
    ]);
  });

  test("matches fuzzy names, implementation text, and multi-word queries", () => {
    expect(filterCommands(commands, "tunit")[0]?.name).toBe("test:unit");
    expect(filterCommands(commands, "play test")[0]?.name).toBe("test:e2e");
    expect(filterCommands(commands, "drizzle migrate")[0]?.name).toBe("database:migrate");
  });

  test("treats regular-expression characters as literal input", () => {
    expect(() => filterCommands(commands, "[")).not.toThrow();
    expect(filterCommands(commands, "[")).toEqual([]);
  });
});
