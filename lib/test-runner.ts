import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { CheckResult } from "@/lib/schemas";
import { npmInvocation } from "../scripts/npm-runner-core.mjs";

const execFile = promisify(execFileCallback);
const timeout = 120_000;
const allowedScripts = new Set(["test", "test:challenge"]);
const stripAnsi = (value: string) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");

export async function runNpm(cwd: string, args: string[]) {
  try {
    const invocation = npmInvocation(args);
    const result = await execFile(invocation.command, invocation.args, {
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
  return runScriptWithArgs(worktreePath, scriptName, []);
}

export async function runScriptWithArgs(worktreePath: string, scriptName: string, args: string[]) {
  assertAllowedScript(scriptName);
  const safeArgs = args.map((argument) => {
    const normalized = argument.replace(/\\/g, "/");
    if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part === "")) {
      throw new Error("Unsafe test path.");
    }
    return normalized;
  });
  return summarize(await runNpm(worktreePath, ["run", scriptName, ...(safeArgs.length ? ["--", ...safeArgs] : [])]));
}

export async function installProjectDependencies(worktreePath: string) {
  const result = await runNpm(worktreePath, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  if (!result.passed) throw new Error(`Project dependency installation failed.\n${result.output}`);
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

export async function runHiddenTestFiles(worktreePath: string, sourceTestFiles: Array<{ source: string; relativePath: string }>, scriptName = "test") {
  const backups = new Map<string, Buffer | null>();
  const destinations: string[] = [];
  try {
    for (const entry of sourceTestFiles) {
      const normalized = entry.relativePath.replace(/\\/g, "/");
      if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part === "")) throw new Error("Unsafe hidden test path.");
      const destination = path.resolve(worktreePath, normalized);
      const relative = path.relative(worktreePath, destination);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Unsafe hidden test destination.");
      await fs.mkdir(path.dirname(destination), { recursive: true });
      backups.set(destination, existsSync(destination) ? await fs.readFile(destination) : null);
      await fs.copyFile(entry.source, destination);
      destinations.push(destination);
    }
    return await runScriptWithArgs(worktreePath, scriptName, sourceTestFiles.map((entry) => entry.relativePath));
  } finally {
    for (const destination of destinations) {
      const backup = backups.get(destination);
      if (backup) await fs.writeFile(destination, backup);
      else await fs.rm(destination, { force: true });
    }
  }
}
