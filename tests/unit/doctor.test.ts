import { describe, expect, test } from "bun:test";
import { createDoctorReport, doctorReportForOutput } from "../../src/core/doctor.js";
import type { CommandCatalog } from "../../src/core/model.js";

function catalog(overrides: Partial<CommandCatalog> = {}): CommandCatalog {
  return {
    schemaVersion: 1,
    project: {
      name: "fixture",
      root: process.cwd(),
      manifestPath: `${process.cwd()}/package.json`,
      workspaceCount: 0,
    },
    packageManager: {
      name: "npm",
      evidence: { source: "packageManager", detail: "npm@11" },
      warnings: [],
    },
    sources: ["package"],
    diagnostics: [],
    groups: [],
    commands: [
      {
        id: "package:.:test",
        name: "test",
        label: "test",
        aliases: [],
        script: "node test.js",
        group: "quality",
        order: 0,
        safety: { confirmationRequired: false },
        requirements: { environment: [], executables: [] },
        workspace: { name: "fixture", path: ".", root: process.cwd(), isRoot: true },
        source: { kind: "package", path: `${process.cwd()}/package.json` },
        execution: { executable: "npm", args: ["run", "test"], forwardedArgsSeparator: "--" },
      },
    ],
    hidden: [],
    ...overrides,
  };
}

describe("createDoctorReport", () => {
  test("reports a ready zero-config project with stable summary data", () => {
    const report = createDoctorReport(catalog(), { schemaVersion: 1, groups: {}, commands: {} });

    expect(report.status).toBe("ready");
    expect(report.configuration).toEqual({ mode: "zero-config" });
    expect(report.summary).toEqual({
      commands: 1,
      workspaces: 0,
      hidden: 0,
      protected: 0,
      ambiguousNames: 0,
      unavailable: 0,
    });
    expect(report.sources).toEqual([{ kind: "package", commands: 1 }]);
    expect(doctorReportForOutput(report, process.cwd()).project.root).toBe(".");
  });

  test("distinguishes source warnings from blocking command failures", () => {
    const warning = createDoctorReport(
      catalog({
        diagnostics: [
          { source: "just", level: "warning", message: "just is missing", hint: "Install just." },
        ],
      }),
      { schemaVersion: 1, groups: {}, commands: {} },
    );
    const failed = createDoctorReport(catalog({ commands: [], sources: [] }), {
      schemaVersion: 1,
      groups: {},
      commands: {},
    });

    expect(warning.status).toBe("warning");
    expect(warning.checks).toContainEqual(
      expect.objectContaining({ id: "source-just", status: "warning" }),
    );
    expect(failed.status).toBe("error");
    expect(failed.checks).toContainEqual(
      expect.objectContaining({ id: "commands", status: "fail" }),
    );
  });

  test("counts protected and ambiguous commands and exposes validated config", () => {
    const first = catalog().commands[0];
    if (first === undefined) throw new Error("Fixture invariant failed.");
    const report = createDoctorReport(
      catalog({
        commands: [
          { ...first, safety: { confirmationRequired: true } },
          { ...first, id: "make:.:test", source: { kind: "make", path: "/repo/Makefile" } },
        ],
      }),
      {
        schemaVersion: 1,
        path: `${process.cwd()}/runpalette.json`,
        groups: {},
        commands: {},
      },
    );

    expect(report.configuration.mode).toBe("file");
    expect(report.summary).toMatchObject({ commands: 2, protected: 1, ambiguousNames: 1 });
    expect(doctorReportForOutput(report, process.cwd()).configuration.path).toBe("runpalette.json");
  });

  test("warns when configured command requirements are unavailable", () => {
    const first = catalog().commands[0];
    if (first === undefined) throw new Error("Fixture invariant failed.");
    const report = createDoctorReport(
      catalog({
        commands: [
          {
            ...first,
            requirements: {
              environment: ["RUNPALETTE_TEST_MISSING_ENV"],
              executables: [],
            },
          },
        ],
      }),
      { schemaVersion: 1, groups: {}, commands: {} },
    );

    expect(report.status).toBe("warning");
    expect(report.summary.unavailable).toBe(1);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: "command-requirements", status: "warning" }),
    );
  });
});
