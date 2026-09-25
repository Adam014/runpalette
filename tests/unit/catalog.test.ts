import { describe, expect, test } from "bun:test";
import { classifyCommand, createCatalog } from "../../src/core/catalog.js";
import type { ProjectContext } from "../../src/core/model.js";

function project(scripts: Record<string, string>): ProjectContext {
  return {
    root: "/workspace/example",
    manifestPath: "/workspace/example/package.json",
    name: "example",
    manifest: { name: "example", scripts },
    packageManager: {
      name: "bun",
      evidence: { source: "lockfile", detail: "bun.lock" },
      warnings: [],
    },
  };
}

describe("createCatalog", () => {
  test("groups scripts by outcome while preserving manifest order", () => {
    const catalog = createCatalog(
      project({
        dev: "vite",
        "test:unit": "vitest",
        build: "tsc",
        "db:migrate": "drizzle-kit migrate",
        mystery: "node mystery.js",
      }),
    );

    expect(catalog.commands.map(({ name, group }) => [name, group])).toEqual([
      ["dev", "develop"],
      ["test:unit", "quality"],
      ["build", "build"],
      ["db:migrate", "operations"],
      ["mystery", "other"],
    ]);
    expect(catalog.groups.map((group) => group.label)).toEqual([
      "Start & develop",
      "Test & quality",
      "Build & release",
      "Data & operations",
      "Other",
    ]);
  });

  test("hides automatic lifecycle scripts and a recursive what alias", () => {
    const catalog = createCatalog(
      project({
        prebuild: "node prepare.js",
        build: "tsc",
        postbuild: "node report.js",
        what: "runpalette",
        test: "vitest",
      }),
    );

    expect(catalog.commands.map((command) => command.name)).toEqual(["build", "test"]);
    expect(catalog.hidden).toEqual([
      { name: "prebuild", reason: "lifecycle" },
      { name: "postbuild", reason: "lifecycle" },
      { name: "what", reason: "self" },
    ]);
  });

  test("does not hide unrelated pre-prefixed scripts", () => {
    const catalog = createCatalog(project({ prepare: "husky", preview: "vite preview" }));

    expect(catalog.commands.map((command) => command.name)).toEqual(["prepare", "preview"]);
  });
});

describe("classifyCommand", () => {
  test("matches complete tokens instead of substrings", () => {
    expect(classifyCommand("contest")).toBe("other");
    expect(classifyCommand("test:watch")).toBe("quality");
    expect(classifyCommand("releaseCandidate")).toBe("build");
  });
});
