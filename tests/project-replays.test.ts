import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFile = promisify(execFileCallback);
const projectId = "linked-replay-test";
const project = { id: projectId, name: "linked replay test", mode: "linked" as const, path: "", detected: { packageManager: "npm" as const, testCommand: "test" as const }, consent: true };
const { runScriptWithArgs } = vi.hoisted(() => ({ runScriptWithArgs: vi.fn() }));

vi.mock("@/lib/projects", () => ({ getProject: vi.fn() }));
vi.mock("@/lib/test-runner", () => ({ installProjectDependencies: vi.fn(async () => undefined), runScriptWithArgs }));

import { getProject } from "@/lib/projects";
import { createLinkedChallenge, listKataTasks, listProjectCommits } from "@/lib/project-replays";
import { projectCacheDirectory } from "@/lib/paths";
import { toPublicChallenge } from "@/lib/challenges";
import { challengeSchema } from "@/lib/schemas";

async function runGit(directory: string, args: string[]) {
  await execFile("git", ["-C", directory, ...args], { windowsHide: true });
}

describe("linked project commit replays", () => {
  let directory = "";
  let testCommit = "";
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(async () => {
    delete process.env.OPENAI_API_KEY;
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "understudy-replay-test-"));
    project.path = directory;
    vi.mocked(getProject).mockResolvedValue(project);
    runScriptWithArgs.mockReset();
    runScriptWithArgs.mockResolvedValueOnce({ passed: false, output: "expected failure", exitCode: 1 }).mockResolvedValueOnce({ passed: true, output: "passed", exitCode: 0 });
    await runGit(directory, ["init"]);
    await runGit(directory, ["config", "user.name", "Understudy Test"]);
    await runGit(directory, ["config", "user.email", "test@understudy.local"]);
    await fs.writeFile(path.join(directory, "package.json"), JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "^4.0.0" } }));
    await fs.writeFile(path.join(directory, "package-lock.json"), JSON.stringify({ name: "linked-replay-test", lockfileVersion: 3, requires: true, packages: { "": { scripts: { test: "vitest run" }, devDependencies: { vitest: "^4.0.0" } } } }));
    await fs.writeFile(path.join(directory, "src.ts"), "export const value = 1;\n");
    await runGit(directory, ["add", "."]);
    await runGit(directory, ["commit", "-m", "Baseline"]);
    await fs.mkdir(path.join(directory, "tests"));
    await fs.writeFile(path.join(directory, "tests", "edge.test.ts"), "import { value } from '../src';\nvoid value;\n");
    await runGit(directory, ["add", "."]);
    await runGit(directory, ["commit", "-m", "Add edge-case coverage"]);
    const result = await execFile("git", ["-C", directory, "rev-parse", "HEAD"], { windowsHide: true });
    testCommit = result.stdout.trim();
  });

  afterEach(async () => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(projectCacheDirectory(projectId), { recursive: true, force: true });
  });

  it("detects added tests, self-validates, and caches the result", async () => {
    const first = await listProjectCommits(projectId);
    const commit = first.find((entry) => entry.sha === testCommit);
    expect(commit).toMatchObject({ addsTests: true, replayable: false, validationStatus: "pending", badge: "validates on create" });
    expect(commit?.filesChanged).toContain("tests/edge.test.ts");
    expect(first.find((entry) => entry.sha !== testCommit)).toMatchObject({ addsTests: false, replayable: false, badge: "no automatic edge-case check" });
    expect(runScriptWithArgs).toHaveBeenCalledTimes(0);

    const result = await createLinkedChallenge(projectId, testCommit.slice(0, 12));
    expect(result.challenge.behavioralCheck).toBe("hidden");
    expect(runScriptWithArgs).toHaveBeenCalledTimes(2);
    const second = await listProjectCommits(projectId);
    expect(second.find((entry) => entry.sha === testCommit)).toMatchObject({ replayable: true, validationStatus: "replayable" });
  });

  it("drafts a schema-valid linked challenge without leaking private history", async () => {
    await listProjectCommits(projectId);
    const result = await createLinkedChallenge(projectId, testCommit.slice(0, 12));
    expect(challengeSchema.parse(result.challenge)).toEqual(result.challenge);
    expect(result.challenge.projectId).toBe(projectId);
    const publicChallenge = toPublicChallenge(result.challenge);
    const serialized = JSON.stringify(publicChallenge);
    expect(serialized).not.toContain(result.challenge.referenceCommit);
    expect(serialized).not.toContain("hiddenTestFiles");
  });

  it("turns linked history into cached, kata-style task cards without an API key", async () => {
    const first = await listKataTasks(projectId, "edge cases");
    expect(first).not.toHaveLength(0);
    expect(first[0]).toMatchObject({ source: "authored" });
    expect(first[0].brief.story).toBeTruthy();
    expect(first[0].brief.example).toBeTruthy();
    const second = await listKataTasks(projectId, "edge cases");
    expect(second.map((task) => task.sha)).toEqual(first.map((task) => task.sha));
    expect(await fs.readdir(path.join(projectCacheDirectory(projectId), "kata-drafts")).catch(() => [])).toEqual([]);
  });

  it("does not label an authored template as an AI-drafted challenge", async () => {
    const result = await createLinkedChallenge(projectId, testCommit.slice(0, 12));
    expect(result.source).toBe("blank");
    expect(result.challenge.drafted).toBe(false);
    expect(result.challenge.draftedBy).toBeUndefined();
  });
});
