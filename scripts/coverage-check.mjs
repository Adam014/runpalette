import { readFile } from "node:fs/promises";
import { summarizeLcov } from "./lib/lcov-summary.mjs";

const summary = summarizeLcov(
  await readFile(new URL("../coverage/lcov.info", import.meta.url), "utf8"),
);

const describe = (value) =>
  `${(value.ratio * 100).toFixed(2)}% (${String(value.hit)}/${String(value.found)})`;

process.stdout.write(
  `Coverage: lines ${describe(summary.lines)}, functions ${describe(summary.functions)}\n`,
);

const minimum = 0.9;
const failures = Object.entries(summary)
  .filter(([, value]) => value.ratio < minimum)
  .map(([name, value]) => `${name} ${describe(value)} is below ${(minimum * 100).toFixed(2)}%`);
if (failures.length > 0) {
  process.stderr.write(
    `Coverage threshold failed:\n${failures.map((item) => `- ${item}`).join("\n")}\n`,
  );
  process.exit(1);
}
