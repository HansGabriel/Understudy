import { existsSync } from "node:fs";
import path from "node:path";
import { builtInFixturePaths, type BuiltInFixtureId } from "@/lib/paths";

export const fixtureSetupMessage = "The bundled practice fixtures are not ready. Run npm run fixture:build, then reload Understudy.";

export class FixtureUnavailableError extends Error {
  constructor() {
    super(fixtureSetupMessage);
    this.name = "FixtureUnavailableError";
  }
}

export function fixtureIsAvailable(projectId: BuiltInFixtureId = "task-manager") {
  const { bundlePath, repoPath } = builtInFixturePaths(projectId);
  return existsSync(path.join(repoPath, ".git")) || existsSync(bundlePath);
}

export function assertFixtureAvailable(projectId: BuiltInFixtureId = "task-manager") {
  if (!fixtureIsAvailable(projectId)) throw new FixtureUnavailableError();
}

export function assertAllFixturesAvailable() {
  assertFixtureAvailable("kata-lab");
  assertFixtureAvailable("task-manager");
}
