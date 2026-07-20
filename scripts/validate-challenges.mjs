import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { npmInvocation } from "./npm-runner.mjs";

const root = process.cwd();
const temporary = path.join(os.tmpdir(), `understudy-validate-${Date.now()}`);
const bundle = path.join(root, "fixtures", "task-manager.bundle");
const kataBundle = path.join(root, "fixtures", "kata-lab.bundle");

const kataAlternativeSource = `export function countVowels(text: string) {
  return Array.from(text).reduce((total, character) => total + (/^[aeiou]$/i.test(character) ? 1 : 0), 0);
}

export function findUniqueNumber(values: number[]) {
  return values.find((value) => values.indexOf(value) === values.lastIndexOf(value)) ?? null;
}

export function hasBalancedBrackets(text: string) {
  const expected: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  for (const character of text) {
    if (character in expected) stack.push(expected[character]);
    else if ([")", "]", "}"].includes(character) && stack.pop() !== character) return false;
  }
  return stack.length === 0;
}

export function twoSumIndices(values: number[], target: number) {
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      if (values[left] + values[right] === target) return [left, right] as [number, number];
    }
  }
  return null;
}
`;

function run(command, args, cwd) {
  try {
    return { ok: true, output: execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    const detail = error;
    return { ok: false, output: `${detail.stdout ?? detail.output?.[1] ?? ""}\n${detail.stderr ?? detail.output?.[2] ?? detail.message ?? ""}` };
  }
}

function npm(args, cwd) {
  const invocation = npmInvocation(args);
  return run(invocation.command, invocation.args, cwd);
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

async function validateKataLab() {
  const manifests = await Promise.all([
    "count-vowels",
    "find-unique-number",
    "balanced-brackets",
    "two-sum-indices",
  ].map(async (id) => JSON.parse(await fs.readFile(path.join(root, "challenges", `${id}.json`), "utf8"))));
  const worktree = path.join(temporary, "kata-lab");
  must(run("git", ["clone", kataBundle, worktree], temporary), "Could not clone Kata Lab fixture bundle");
  must(npm(["ci", "--ignore-scripts", "--no-audit", "--no-fund"], worktree), "Could not install Kata Lab fixture dependencies");

  for (const manifest of manifests) {
    must(run("git", ["checkout", manifest.baseCommit], worktree), `${manifest.id}: could not checkout base commit`);
    must(npm(["run", "test"], worktree), `${manifest.id}: normal suite must pass at base`);
    if ((await runChallenge(worktree, manifest)).ok) throw new Error(`${manifest.id}: behavioral challenge unexpectedly passed at base.`);

    must(run("git", ["checkout", manifest.referenceCommit], worktree), `${manifest.id}: could not checkout reference commit`);
    must(await runChallenge(worktree, manifest), `${manifest.id}: behavioral challenge must pass at reference commit`);

    must(run("git", ["checkout", manifest.baseCommit], worktree), `${manifest.id}: could not restore base for alternate implementation`);
    await fs.writeFile(path.join(worktree, "src", "katas.ts"), kataAlternativeSource, "utf8");
    must(await runChallenge(worktree, manifest), `${manifest.id}: behavioral challenge must pass for an alternate implementation`);
    must(run("git", ["checkout", "--", "src/katas.ts"], worktree), `${manifest.id}: could not discard alternate implementation`);
  }
}

async function main() {
  const optimistic = JSON.parse(await fs.readFile(path.join(root, "challenges", "optimistic-rollback.json"), "utf8"));
  const persisted = JSON.parse(await fs.readFile(path.join(root, "challenges", "persist-filter.json"), "utf8"));
  await fs.mkdir(temporary, { recursive: true });
  const worktree = path.join(temporary, "task-manager");
  must(run("git", ["clone", bundle, worktree], temporary), "Could not clone fixture bundle");
  must(npm(["ci", "--ignore-scripts", "--no-audit", "--no-fund"], worktree), "Could not install fixture dependencies");

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
  await validateKataLab();
  console.log("Challenge validation passed: every base fails its behavioral check, every reference passes, and alternate implementations pass.");
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => fs.rm(temporary, { recursive: true, force: true }));
