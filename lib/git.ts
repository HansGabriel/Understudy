import { execFile as execFileCallback } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { assertInside, fixtureBundlePath, fixtureRepoPath, runtimeRoot, sessionDirectory, sessionWorktreePath, sessionsRoot } from "@/lib/paths";
import { installFixtureDependencies } from "@/lib/test-runner";

const execFile = promisify(execFileCallback);

async function git(args: string[], cwd = runtimeRoot) {
  try {
    const result = await execFile("git", args, { cwd, windowsHide: true, timeout: 120_000, maxBuffer: 2_000_000 });
    return `${result.stdout}\n${result.stderr}`.trim();
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(`${detail.stdout ?? ""}\n${detail.stderr ?? detail.message ?? "Git command failed."}`.trim());
  }
}

export async function ensureFixture() {
  if (existsSync(path.join(fixtureRepoPath, ".git"))) return fixtureRepoPath;
  if (!existsSync(fixtureBundlePath)) throw new Error("Fixture bundle is missing. Run npm run fixture:build.");
  await fs.mkdir(runtimeRoot, { recursive: true });
  await git(["clone", fixtureBundlePath, fixtureRepoPath], runtimeRoot);
  return fixtureRepoPath;
}

export async function createWorktree(sessionId: string, baseCommit: string) {
  const fixture = await ensureFixture();
  const worktree = sessionWorktreePath(sessionId);
  const sessionDir = sessionDirectory(sessionId);
  assertInside(sessionsRoot, sessionDir);
  await fs.mkdir(sessionDir, { recursive: true });
  try {
    await git(["-C", fixture, "worktree", "add", "--detach", worktree, baseCommit]);
    await installFixtureDependencies(worktree);
    return worktree;
  } catch (error) {
    await removeWorktree(sessionId).catch(() => undefined);
    throw error;
  }
}

export async function removeWorktree(sessionId: string) {
  const fixture = await ensureFixture();
  const worktree = sessionWorktreePath(sessionId);
  if (existsSync(worktree)) await git(["-C", fixture, "worktree", "remove", "--force", worktree]);
  await git(["-C", fixture, "worktree", "prune"]);
  await fs.rm(sessionDirectory(sessionId), { recursive: true, force: true });
}

export async function diffSummary(worktreePath: string) {
  const safeWorktree = assertInside(sessionsRoot, worktreePath);
  const stat = await git(["-C", safeWorktree, "diff", "--stat"]);
  const shortstat = await git(["-C", safeWorktree, "diff", "--shortstat"]);
  return { stat, shortstat };
}

export async function canOpenVSCode() {
  try {
    await execFile("code", ["--version"], { windowsHide: true, timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}
