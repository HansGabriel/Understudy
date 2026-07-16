import { existsSync } from "node:fs";
import path from "node:path";
import { fixtureBundlePath, fixtureRepoPath } from "@/lib/paths";

export const fixtureSetupMessage = "The task-manager fixture is not ready. Run npm run fixture:build, then reload Understudy.";

export class FixtureUnavailableError extends Error {
  constructor() {
    super(fixtureSetupMessage);
    this.name = "FixtureUnavailableError";
  }
}

export function fixtureIsAvailable() {
  return existsSync(path.join(fixtureRepoPath, ".git")) || existsSync(fixtureBundlePath);
}

export function assertFixtureAvailable() {
  if (!fixtureIsAvailable()) throw new FixtureUnavailableError();
}
