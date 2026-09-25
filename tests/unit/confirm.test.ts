import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import type { ExecutionPlan } from "../../src/core/model.js";
import { affirmative, confirmExecution } from "../../src/ui/confirm.js";

function plan(message?: string): ExecutionPlan {
  return {
    schemaVersion: 1,
    command: "run",
    packageManager: "npm",
    executable: "npm",
    args: ["run", "release"],
    cwd: "/repo",
    script: { name: "release", value: "npm publish", requestedAs: "release" },
    workspace: { name: "repo", path: ".", root: "/repo", isRoot: true },
    safety: { confirmationRequired: true, ...(message === undefined ? {} : { message }) },
  };
}

describe("affirmative", () => {
  test("accepts only explicit yes answers", () => {
    expect(affirmative("y")).toBe(true);
    expect(affirmative(" YES ")).toBe(true);
    expect(affirmative("no")).toBe(false);
    expect(affirmative("")).toBe(false);
  });

  test("asks with configured context and accepts an explicit answer", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk) => {
      written += chunk.toString();
    });
    input.end("yes\n");

    expect(await confirmExecution(plan("Publishing is permanent."), { input, output })).toBe(true);
    expect(written).toContain("Publishing is permanent.");
    expect(written).toContain("Run repo · release? [y/N]");
  });

  test("uses a safe default message and rejects an empty answer", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let written = "";
    output.on("data", (chunk) => {
      written += chunk.toString();
    });
    input.end("\n");

    expect(await confirmExecution(plan(), { input, output })).toBe(false);
    expect(written).toContain("configured to require confirmation");
  });
});
