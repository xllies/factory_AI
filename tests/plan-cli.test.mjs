import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = path.join(workspaceRoot, "output", "test");

function runCli(args) {
  const result = spawnSync(
    "node",
    ["--import", "tsx", "scripts/dark-factory.ts", ...args],
    { cwd: workspaceRoot, encoding: "utf8", shell: process.platform === "win32" },
  );
  if (result.status !== 0) {
    throw new Error(`CLI failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

test("plan command uses explicit source and writes output", async () => {
  const source = "tests/fixtures/requirements-min.md";
  const out = "output/test/generated-from-fixture.json";

  await rm(path.join(workspaceRoot, "output", "test"), { recursive: true, force: true });
  runCli(["plan", source, "--out", out]);

  const raw = await readFile(path.join(workspaceRoot, out), "utf8");
  const plan = JSON.parse(raw);

  assert.equal(plan.source_file, source);
  assert.ok(Array.isArray(plan.epics));
  assert.ok(plan.epics.length >= 1);
  assert.ok(Array.isArray(plan.open_questions));
  assert.ok(plan.open_questions.length >= 1);
});

test("apply command without approve does not require jira credentials", async () => {
  const source = "tests/fixtures/requirements-min.md";
  const planOut = "output/test/plan-for-dry-run.json";
  runCli(["plan", source, "--out", planOut]);

  const result = runCli(["apply", planOut, "--project", "KAN"]);
  assert.match(result.stdout, /Dry run complete/);
});

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});
