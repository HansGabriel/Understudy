import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectRoot, sessionDirectory, sessionWorktreePath } from "@/lib/paths";
import { saveSession } from "@/lib/sessions";
import type { SessionRecord } from "@/lib/schemas";

const { runScript, runHiddenTest } = vi.hoisted(() => ({ runScript: vi.fn(), runHiddenTest: vi.fn() }));

vi.mock("@/lib/test-runner", () => ({
  runScript,
  runHiddenTest,
  runHiddenTestFiles: vi.fn(),
}));

import { POST as verify } from "@/app/api/sessions/[id]/verify/route";

function sessionRecord(id: string): SessionRecord {
  return {
    id,
    challengeId: "count-vowels",
    projectId: "kata-lab",
    createdAt: new Date().toISOString(),
    worktreePath: sessionWorktreePath(id),
    status: "coding",
    plan: { answers: ["behavior", "investigation", "edge case"], aiFeedback: "", revisionCount: 0, confirmed: true },
    attempts: [],
    hints: [],
    explainBack: { question: "Why?", answer: "", aiFeedback: "" },
    reflection: "",
    reflectionBullets: [],
    timeline: [],
    coachThread: [],
  };
}

afterEach(async () => {
  runScript.mockReset();
  runHiddenTest.mockReset();
});

describe("built-in behavioral verification", () => {
  it("uses the manifest's nested hidden-test path for Kata Lab", async () => {
    const id = randomUUID();
    runScript.mockResolvedValue({ passed: true, output: "Tests 4 passed", exitCode: 0, total: 4, failures: [] });
    runHiddenTest.mockResolvedValue({ passed: true, output: "Tests 1 passed", exitCode: 0, total: 1, failures: [] });
    try {
      await saveSession(sessionRecord(id));
      const response = await verify(new Request(`http://localhost/api/sessions/${id}/verify`, { method: "POST" }), { params: Promise.resolve({ id }) } as never);

      expect(response.status).toBe(200);
      expect(runHiddenTest).toHaveBeenCalledWith(
        sessionWorktreePath(id),
        path.resolve(projectRoot, "challenges/tests/kata-lab/count-vowels.challenge.test.ts"),
      );
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });
});
