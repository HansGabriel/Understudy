import { execFileSync } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const temporary = path.join(os.tmpdir(), `understudy-validate-${Date.now()}`);
const bundle = path.join(root, "fixtures", "task-manager.bundle");

function run(command, args, cwd) {
  try {
    return { ok: true, output: execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    const detail = error;
    return { ok: false, output: `${detail.stdout ?? detail.output?.[1] ?? ""}\n${detail.stderr ?? detail.output?.[2] ?? detail.message ?? ""}` };
  }
}

function npm(args, cwd) {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) return run(process.execPath, [process.env.npm_execpath, ...args], cwd);
  return run(process.platform === "win32" ? "npm.cmd" : "npm", args, cwd);
}

function must(result, label) {
  if (!result.ok) throw new Error(`${label}\n${result.output}`);
}

async function copyChallengeTest(worktree, manifest) {
  const destination = path.join(worktree, "tests", "challenge.test.ts");
  await fs.copyFile(path.join(root, manifest.hiddenTestFile), destination);
  return destination;
}

async function runChallenge(worktree, manifest) {
  const hidden = await copyChallengeTest(worktree, manifest);
  try {
    return npm(["run", "test:challenge"], worktree);
  } finally {
    await fs.rm(hidden, { force: true });
  }
}

async function main() {
  const optimistic = JSON.parse(await fs.readFile(path.join(root, "challenges", "optimistic-rollback.json"), "utf8"));
  const persisted = JSON.parse(await fs.readFile(path.join(root, "challenges", "persist-filter.json"), "utf8"));
  await fs.mkdir(temporary, { recursive: true });
  const worktree = path.join(temporary, "task-manager");
  must(run("git", ["clone", bundle, worktree], temporary), "Could not clone fixture bundle");
  must(npm(["ci", "--ignore-scripts"], worktree), "Could not install fixture dependencies");

  must(run("git", ["checkout", optimistic.baseCommit], worktree), "Could not checkout optimistic base");
  must(npm(["run", "test"], worktree), "Normal suite must pass at optimistic base");
  const atBase = await runChallenge(worktree, optimistic);
  if (atBase.ok) throw new Error("Optimistic behavioral challenge unexpectedly passed at its base commit.");

  must(run("git", ["checkout", optimistic.referenceCommit], worktree), "Could not checkout optimistic reference");
  must(await runChallenge(worktree, optimistic), "Optimistic behavioral challenge must pass at reference commit");

  must(run("git", ["checkout", optimistic.baseCommit], worktree), "Could not reset to optimistic base");
  const implementation = path.join(worktree, "src", "task-manager.ts");
  const baseline = await fs.readFile(implementation, "utf8");
  const alternative = baseline.replace(
    /const nextTask = \{ \.\.\.task, done: !task\.done \};\s*await this\.saveTask\(nextTask\);\s*this\.tasks = this\.tasks\.map\(\(item\) => item\.id === id \? nextTask : item\);/,
    "const previous = { ...task };\n    const nextTask = { ...task, done: !task.done };\n    this.tasks = this.tasks.map((item) => item.id === id ? nextTask : item);\n    try { await this.saveTask(nextTask); } catch { this.tasks = this.tasks.map((item) => item.id === id ? previous : item); this.error = \"Save rejected\"; }",
  );
  await fs.writeFile(implementation, alternative);
  must(await runChallenge(worktree, optimistic), "Optimistic behavioral challenge must pass for an alternative implementation");

  must(run("git", ["checkout", "--", "src/task-manager.ts"], worktree), "Could not discard temporary alternate implementation");
  must(run("git", ["checkout", persisted.baseCommit], worktree), "Could not checkout persistence base");
  const persistBase = await runChallenge(worktree, persisted);
  if (persistBase.ok) throw new Error("Persistence behavioral challenge unexpectedly passed at its base commit.");
  must(run("git", ["checkout", persisted.referenceCommit], worktree), "Could not checkout persistence reference");
  must(await runChallenge(worktree, persisted), "Persistence behavioral challenge must pass at reference commit");
  console.log("Challenge validation passed: base failures, reference passes, and an alternative rollback implementation pass.");
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => fs.rm(temporary, { recursive: true, force: true }));
