import path from "node:path";

export const projectRoot = process.cwd();
export const runtimeRoot = path.resolve(projectRoot, "runtime");
export const sessionsRoot = path.resolve(runtimeRoot, "sessions");
export const projectsRegistryPath = path.resolve(runtimeRoot, "projects.json");
export const projectsCacheRoot = path.resolve(runtimeRoot, "projects-cache");
export const challengesRoot = path.resolve(projectRoot, "challenges");
export const fixtureBundlePath = path.resolve(projectRoot, "fixtures", "task-manager.bundle");
export const fixtureRepoPath = path.resolve(runtimeRoot, "task-manager");
export const kataLabFixtureBundlePath = path.resolve(projectRoot, "fixtures", "kata-lab.bundle");
export const kataLabFixtureRepoPath = path.resolve(runtimeRoot, "kata-lab");
export const sampleSessionFixturePath = path.resolve(projectRoot, "fixtures", "sample-session.json");
export const sampleSessionId = "00000000-0000-4000-8000-000000000001";

export type BuiltInFixtureId = "task-manager" | "kata-lab";

export function builtInFixturePaths(projectId: BuiltInFixtureId) {
  if (projectId === "kata-lab") return { bundlePath: kataLabFixtureBundlePath, repoPath: kataLabFixtureRepoPath };
  return { bundlePath: fixtureBundlePath, repoPath: fixtureRepoPath };
}

export function assertInside(parent: string, candidate: string) {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedParent, resolvedCandidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Unsafe filesystem path.");
  }
  return resolvedCandidate;
}

export function assertAbsoluteLocalPath(candidate: string) {
  if (!path.isAbsolute(candidate) || /(^|[\\/])\.\.(?:[\\/]|$)/.test(candidate)) {
    throw new Error("Unsafe project path. Use an absolute local repository path without traversal segments.");
  }
  return path.resolve(candidate);
}

export function projectCacheDirectory(projectId: string) {
  if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error("Unsafe project id.");
  return assertInside(projectsCacheRoot, path.join(projectsCacheRoot, projectId));
}

export function sessionDirectory(sessionId: string) {
  return assertInside(sessionsRoot, path.join(sessionsRoot, sessionId));
}

export function sessionWorktreePath(sessionId: string) {
  return assertInside(sessionsRoot, path.join(sessionDirectory(sessionId), "worktree"));
}

export function sessionFilePath(sessionId: string) {
  return assertInside(sessionsRoot, path.join(sessionDirectory(sessionId), "session.json"));
}
