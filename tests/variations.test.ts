import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFile = promisify(execFileCallback);
const { gitMock, ensureFixtureMock, runScriptMock, runHiddenTestMock } = vi.hoisted(() => ({ gitMock: vi.fn(), ensureFixtureMock: vi.fn(), runScriptMock: vi.fn(), runHiddenTestMock: vi.fn() }));

vi.mock("@/lib/git", () => ({ git: gitMock, ensureFixture: ensureFixtureMock }));
vi.mock("@/lib/test-runner", () => ({ installProjectDependencies: vi.fn(async () => undefined), runScript: runScriptMock, runHiddenTest: runHiddenTestMock }));

import { projectVariationDirectory } from "@/lib/project-cache";
import { publishVariation, validateVariation } from "@/lib/variations";
import { listLinkedChallenges } from "@/lib/project-cache";
import type { VariationProposal } from "@/lib/schemas";

async function actualGit(args: string[]) {
  const result = await execFile("git", args, { windowsHide: true });
  return result.stdout.trim();
}

const proposal: VariationProposal = {
  title: "Retry task saves once",
  difficulty: 3,
  estimatedTime: "20–30 min",
  learningObjectives: ["retry behavior"],
  brief: { desiredBehavior: "Retry a rejected save once before exposing an error.", acceptanceCriteria: ["A rejected first save is retried.", "A second rejection is surfaced."], constraints: ["Work in the task-manager source file."] },
  planQuestions: ["What should happen after the first rejection?", "Which state must remain stable?", "What proves the retry limit?"],
  hints: [{ level: 1, text: "Think about the boundary between a first and second attempt." }, { level: 2, text: "Which result should the caller observe after one retry?" }, { level: 3, text: "Inspect the save path and its failure state." }],
  explainBackQuestion: "Why is one retry bounded?",
  sourcePath: "src/task-manager.ts",
  referenceSource: "export const variation = true;\n",
  behavioralTest: "import { expect, it } from 'vitest'; it('passes only for the variation', () => expect(true).toBe(true));\n",
};

describe("Forge-lite validation gate", () => {
  let fixture = "";

  beforeEach(async () => {
    fixture = await fs.mkdtemp(path.join(os.tmpdir(), "understudy-variation-gate-"));
    await actualGit(["init", fixture]);
    await actualGit(["-C", fixture, "config", "user.name", "Understudy Test"]);
    await actualGit(["-C", fixture, "config", "user.email", "test@understudy.local"]);
    await fs.mkdir(path.join(fixture, "src"));
    await fs.writeFile(path.join(fixture, "src", "task-manager.ts"), "export const variation = false;\n");
    await actualGit(["-C", fixture, "add", "."]);
    await actualGit(["-C", fixture, "commit", "-m", "Base"]);
    const head = await actualGit(["-C", fixture, "rev-parse", "HEAD"]);
    ensureFixtureMock.mockResolvedValue(fixture);
    gitMock.mockImplementation(async (args: string[]) => actualGit(args));
    runScriptMock.mockReset();
    runHiddenTestMock.mockReset();
    runScriptMock.mockResolvedValue({ passed: true, output: "pass", exitCode: 0 });
    runHiddenTestMock.mockResolvedValueOnce({ passed: false, output: "fail at base", exitCode: 1 }).mockResolvedValueOnce({ passed: true, output: "pass at reference", exitCode: 0 });
    (proposal as VariationProposal & { baseCommit?: string }).baseCommit = head;
  });

  afterEach(async () => {
    await fs.rm(fixture, { recursive: true, force: true });
    await fs.rm(projectVariationDirectory("task-manager"), { recursive: true, force: true });
  });

  it("publishes a reference only after base-fails/reference-passes", async () => {
    const base = (proposal as VariationProposal & { baseCommit?: string }).baseCommit!;
    const result = await validateVariation(base, proposal, proposal.title);
    expect(result.referenceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(runHiddenTestMock).toHaveBeenCalledTimes(2);
    await expect(fs.stat(result.bundlePath)).resolves.toBeDefined();
    const heads = await actualGit(["bundle", "list-heads", result.bundlePath]);
    expect(heads).toContain(result.referenceCommit);
  });

  it("rejects a variation whose behavioral test passes at base", async () => {
    runHiddenTestMock.mockReset().mockResolvedValue({ passed: true, output: "already passes", exitCode: 0 });
    const base = (proposal as VariationProposal & { baseCommit?: string }).baseCommit!;
    await expect(validateVariation(base, proposal, proposal.title)).rejects.toThrow(/passes at base/i);
  });

  it("never publishes a manifest when the private gate fails", async () => {
    runHiddenTestMock.mockReset().mockResolvedValue({ passed: true, output: "already passes", exitCode: 0 });
    const base = (proposal as VariationProposal & { baseCommit?: string }).baseCommit!;
    const baseChallenge = { id: "optimistic-rollback", projectId: "task-manager", drafted: false, mode: "replay" as const, title: "Base", baseCommit: "0000000", referenceCommit: base, difficulty: 3, estimatedTime: "20 min", testCommand: "test", hiddenTestCommand: "test:challenge", hiddenTestFile: "hidden", hiddenTestFiles: [], behavioralCheck: "hidden" as const, learningObjectives: ["state"], brief: { desiredBehavior: "state", acceptanceCriteria: ["state"], constraints: ["state"] }, planQuestions: ["state", "state", "state"], hints: [{ level: 1, text: "state" }, { level: 2, text: "state" }, { level: 3, text: "state" }], explainBackQuestion: "state", };
    await expect(publishVariation(baseChallenge, proposal)).rejects.toThrow(/passes at base/i);
    expect(await listLinkedChallenges("task-manager")).toHaveLength(0);
  });
});
