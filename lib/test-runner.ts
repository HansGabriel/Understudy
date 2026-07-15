import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { CheckResult } from "@/lib/schemas";

const execFile = promisify(execFileCallback);
const timeout = 120_000;
const allowedScripts = new Set(["test", "test:challenge"]);
const stripAnsi = (value: string) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");

function npmCliPath() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) return process.env.npm_execpath;
  const bundled = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(bundled)) return bundled;
  throw new Error("Could not find the npm CLI. Start Understudy with npm or install Node.js with npm.");
}

export async function runNpm(cwd: string, args: string[]) {
  try {
    const result = await execFile(process.execPath, [npmCliPath(), ...args], {
      cwd,
      timeout,
      maxBuffer: 2_000_000,
      windowsHide: true,
    });
    return { passed: true, output: stripAnsi(`${result.stdout}\n${result.stderr}`.trim()), exitCode: 0 };
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      passed: false,
      output: stripAnsi(`${detail.stdout ?? ""}\n${detail.stderr ?? detail.message ?? ""}`.trim()),
      exitCode: typeof detail.code === "number" ? detail.code : 1,
    };
  }
}

function summarize(result: { passed: boolean; output: string; exitCode: number }): CheckResult {
  const totalMatch = result.output.match(/Tests\s+(\d+)\s+passed/i) ?? result.output.match(/(\d+)\s+passed/i);
  const failures = result.output
    .split("\n")
    .filter((line) => /failed|error|expected/i.test(line))
    .slice(0, 8);
  return { ...result, total: totalMatch ? Number(totalMatch[1]) : undefined, failures };
}

export function assertAllowedScript(scriptName: string): asserts scriptName is "test" | "test:challenge" {
  if (!allowedScripts.has(scriptName)) throw new Error("Only manifest-declared test scripts may run.");
}

export async function runScript(worktreePath: string, scriptName: string) {
  assertAllowedScript(scriptName);
  return summarize(await runNpm(worktreePath, ["run", scriptName]));
}

export async function installFixtureDependencies(worktreePath: string) {
  const result = await runNpm(worktreePath, ["ci", "--ignore-scripts"]);
  if (!result.passed) throw new Error(`Fixture dependency installation failed.\n${result.output}`);
}

export async function runHiddenTest(worktreePath: string, sourceTestFile: string) {
  const testsDirectory = path.resolve(worktreePath, "tests");
  const destination = path.resolve(testsDirectory, "challenge.test.ts");
  const relative = path.relative(testsDirectory, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Unsafe hidden test destination.");
  await fs.mkdir(testsDirectory, { recursive: true });
  await fs.copyFile(sourceTestFile, destination);
  try {
    return await runScript(worktreePath, "test:challenge");
  } finally {
    await fs.rm(destination, { force: true });
  }
}
