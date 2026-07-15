import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendTimeline, loadSession, saveSession } from "@/lib/sessions";
import { sessionDirectory } from "@/lib/paths";
import type { SessionRecord } from "@/lib/schemas";

function testSession(id: string): SessionRecord {
  return {
    id,
    challengeId: "optimistic-rollback",
    createdAt: new Date().toISOString(),
    worktreePath: `runtime/sessions/${id}/worktree`,
    status: "planning",
    plan: { answers: ["", "", ""], aiFeedback: "" },
    attempts: [],
    hints: [],
    explainBack: { question: "Why?", answer: "", aiFeedback: "" },
    reflection: "",
    timeline: [],
  };
}

describe("session persistence", () => {
  it("writes and reloads an atomically valid session record", async () => {
    const id = randomUUID();
    const record = appendTimeline(testSession(id), "plan_submitted", { answerCount: 3 });
    try {
      await saveSession(record);
      expect(await loadSession(id)).toEqual(record);
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });
});
