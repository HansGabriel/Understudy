import path from "node:path";

export const projectRoot = process.cwd();
export const runtimeRoot = path.resolve(projectRoot, "runtime");
export const sessionsRoot = path.resolve(runtimeRoot, "sessions");
export const challengesRoot = path.resolve(projectRoot, "challenges");
export const fixtureBundlePath = path.resolve(projectRoot, "fixtures", "task-manager.bundle");
export const fixtureRepoPath = path.resolve(runtimeRoot, "task-manager");

export function assertInside(parent: string, candidate: string) {
  const resolvedParent = path.resolve(parent);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedParent, resolvedCandidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Unsafe filesystem path.");
  }
  return resolvedCandidate;
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
