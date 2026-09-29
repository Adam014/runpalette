import { describe, expect, test } from "bun:test";
import type { ExecutionPlan } from "../../src/core/model.js";
import { assertPlanReady, evaluateRequirements } from "../../src/core/requirements.js";

describe("command requirements", () => {
  test("evaluates names only and treats an empty environment value as present", () => {
    expect(
      evaluateRequirements(
        { environment: ["EMPTY", "MISSING"], executables: ["available", "missing"] },
        { EMPTY: "" },
        (name) => name === "available",
      ),
    ).toEqual({
      ready: false,
      missingEnvironment: ["MISSING"],
      missingExecutables: ["missing"],
    });
  });

  test("fails execution with an actionable structured product error", () => {
    const plan = {
      script: { name: "deploy" },
      readiness: {
        ready: false,
        missingEnvironment: ["DEPLOY_TOKEN"],
        missingExecutables: ["terraform"],
      },
    } as ExecutionPlan;

    expect(() => assertPlanReady(plan)).toThrow("DEPLOY_TOKEN");
    try {
      assertPlanReady(plan);
    } catch (error) {
      expect(error).toMatchObject({ code: "COMMAND_REQUIREMENTS_UNMET" });
    }
  });
});
