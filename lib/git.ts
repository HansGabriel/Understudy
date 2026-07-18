import { execFile as execFileCallback } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { assertFixtureAvailable, FixtureUnavailableError } from "@/lib/fixture";
import { getProject, linkedProjectPath } from "@/lib/projects";
import { assertAbsoluteLocalPath, assertInside, fixtureBundlePath, fixtureRepoPath, runtimeRoot, sessionDirectory, sessionWorktreePath, sessionsRoot } from "@/lib/paths";
import { installProjectDependencies } from "@/lib/test-runner";
import { projectVariationDirectory } from "@/lib/project-cache";

const execFile = promisify(execFileCallback);

export { assertFixtureAvailable, fixtureIsAvailable, fixtureSetupMessage, FixtureUnavailableError } from "@/lib/fixture";

export type DiffDetails = {
  patch: string;
  files: string[];
};

export type ReferenceDiff = DiffDetails & {
  commit: string;
};

export async function git(args: string[], cwd = runtimeRoot) {
  try {
    const result = await execFile("git", args, { cwd, windowsHide: true, timeout: 120_000, maxBuffer: 2_000_000 });
    // Git can emit harmless line-ending and repository warnings on stderr. They
    // must not become part of learner-facing diff/stat data.
    return result.stdout.trim();
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(`${detail.stdout ?? ""}\n${detail.stderr ?? detail.message ?? "Git command failed."}`.trim());
  }
}

export async function ensureFixture(...requiredCommits: string[]) {
  if (existsSync(path.join(fixtureRepoPath, ".git"))) {
    const missingCommits = await findMissingCommits(fixtureRepoPath, requiredCommits);
    if (missingCommits.length) {
      try {
        // The bundle can be rebuilt while an older clone remains under
        // runtime/. Refresh objects before creating a worktree or showing a
        // reference diff, otherwise Git reports an opaque "invalid reference".
        await git(["-C", fixtureRepoPath, "fetch", "--prune", "origin"]);
      } catch {
        throw new FixtureUnavailableError();
      }
      await fetchVariationBundles(fixtureRepoPath);
      if ((await findMissingCommits(fixtureRepoPath, missingCommits)).length) {
        throw new FixtureUnavailableError();
      }
    }
    return fixtureRepoPath;
  }
  assertFixtureAvailable();
  await fs.mkdir(runtimeRoot, { recursive: true });
  await git(["clone", fixtureBundlePath, fixtureRepoPath], runtimeRoot);
  await fetchVariationBundles(fixtureRepoPath);
  if ((await findMissingCommits(fixtureRepoPath, requiredCommits)).length) {
    throw new FixtureUnavailableError();
  }
  return fixtureRepoPath;
}

async function fetchVariationBundles(fixture: string) {
  try {
    const directory = projectVariationDirectory("task-manager");
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".bundle"))) {
      const bundle = path.join(directory, entry.name);
      await git(["-C", fixture, "fetch", bundle, "refs/*:refs/*"]);
    }
  } catch {
    // Generated variations are optional; the caller will report a missing commit if needed.
  }
}

async function findMissingCommits(fixture: string, commits: string[]) {
  const missing: string[] = [];
  for (const commit of commits) {
    try {
      await git(["-C", fixture, "cat-file", "-e", `${commit}^{commit}`]);
    } catch {
      missing.push(commit);
    }
  }
  return missing;
}

export async function createWorktree(sessionId: string, baseCommit: string, projectId = "task-manager") {
  const source = projectId === "task-manager"
    ? await ensureFixture(baseCommit)
    : linkedProjectPath(await getProject(projectId));
  const worktree = sessionWorktreePath(sessionId);
  const sessionDir = sessionDirectory(sessionId);
  assertInside(sessionsRoot, sessionDir);
  await fs.mkdir(sessionDir, { recursive: true });
  try {
    await git(["-C", source, "worktree", "add", "--detach", worktree, baseCommit]);
    await installProjectDependencies(worktree);
    return worktree;
  } catch (error) {
    await removeWorktree(sessionId, projectId).catch(() => undefined);
    throw error;
  }
}

export async function removeWorktree(sessionId: string, projectId = "task-manager") {
  const worktree = sessionWorktreePath(sessionId);
  try {
    const source = projectId === "task-manager"
      ? await ensureFixture()
      : assertAbsoluteLocalPath(linkedProjectPath(await getProject(projectId)));
    if (existsSync(worktree)) await git(["-C", source, "worktree", "remove", "--force", worktree]);
    await git(["-C", source, "worktree", "prune"]);
  } finally {
    await fs.rm(sessionDirectory(sessionId), { recursive: true, force: true });
  }
}

export async function diffSummary(worktreePath: string) {
  const safeWorktree = assertInside(sessionsRoot, worktreePath);
  const [stat, shortstat, patch] = await Promise.all([
    git(["-C", safeWorktree, "diff", "HEAD", "--stat"]),
    git(["-C", safeWorktree, "diff", "HEAD", "--shortstat"]),
    git(["-C", safeWorktree, "diff", "HEAD", "--no-ext-diff", "--unified=0", "--"]),
  ]);
  return { stat, shortstat, addedLines: extractAddedLines(patch) };
}

export function extractAddedLines(patch: string, limit = 6) {
  return patch
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .slice(0, limit)
    .map((line) => line.length > 240 ? `${line.slice(0, 237)}...` : line);
}

function fileList(output: string) {
  return output.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
}

export async function diffDetails(worktreePath: string): Promise<DiffDetails> {
  const safeWorktree = assertInside(sessionsRoot, worktreePath);
  const [patch, names] = await Promise.all([
    git(["-C", safeWorktree, "diff", "HEAD", "--no-ext-diff", "--unified=3", "--"]),
    git(["-C", safeWorktree, "diff", "HEAD", "--name-only", "--"]),
  ]);
  return { patch, files: fileList(names) };
}

export async function referenceDiff(baseCommit: string, referenceCommit: string, projectId = "task-manager"): Promise<ReferenceDiff> {
  const fixture = projectId === "task-manager"
    ? await ensureFixture(baseCommit, referenceCommit)
    : assertAbsoluteLocalPath(linkedProjectPath(await getProject(projectId)));
  const [patch, names] = await Promise.all([
    git(["-C", fixture, "diff", "--no-ext-diff", "--unified=3", baseCommit, referenceCommit, "--"]),
    git(["-C", fixture, "diff", "--name-only", baseCommit, referenceCommit, "--"]),
  ]);
  return { commit: referenceCommit, patch, files: fileList(names) };
}

export async function canOpenVSCode() {
  const candidates = process.platform === "win32" ? ["code.cmd", "code"] : ["code"];
  for (const candidate of candidates) {
    try {
      await execFile(candidate, ["--version"], { windowsHide: true, timeout: 2_000 });
      return true;
    } catch {
      // Try the next platform-specific executable name.
    }
  }
  return false;
}
