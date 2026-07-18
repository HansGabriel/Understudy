import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { POST as sendCoachMessage } from "@/app/api/sessions/[id]/coach/route";
import { coachEscalation, acceptsCoachFeedback, redactCoachContext, type CoachContext } from "@/lib/ai";
import { listChallenges } from "@/lib/challenges";
import { sessionDirectory } from "@/lib/paths";
import { sessionSchema, type SessionRecord } from "@/lib/schemas";
import { loadSession, saveSession } from "@/lib/sessions";

function sessionRecord(id: string, coachThread: SessionRecord["coachThread"] = []): SessionRecord {
  return {
    id,
    challengeId: "optimistic-rollback",
    createdAt: new Date().toISOString(),
    worktreePath: `runtime/sessions/${id}/worktree`,
    status: "coding",
    plan: { answers: ["Observe the task state", "Inspect the save path", "Check the rejected save case"], aiFeedback: "Plan check: aligned", revisionCount: 0, confirmed: true },
    attempts: [],
    hints: [],
    explainBack: { question: "Why?", answer: "", aiFeedback: "" },
    reflection: "",
    lastCoaching: null,
    coachThread,
    timeline: [],
  };
}

async function coachRequest(id: string, message = "I am unsure what evidence to look for.") {
  return sendCoachMessage(new Request(`http://localhost/api/sessions/${id}/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }), { params: Promise.resolve({ id }) } as never);
}

describe("coach panel", () => {
  it("round-trips a coach thread through the session schema", () => {
    const id = randomUUID();
    const at = new Date().toISOString();
    const parsed = sessionSchema.parse(sessionRecord(id, [
      { role: "learner", text: "What should I observe?", at },
      { role: "coach", text: "Start with the behavior the test can observe.", at, source: "authored" },
    ]));
    expect(parsed.coachThread).toHaveLength(2);
    expect(parsed.coachThread[1].source).toBe("authored");
  });

  it("gates pseudocode and partial shapes behind the hint ladder", async () => {
    const [challenge] = await listChallenges();
    const base: CoachContext = {
      challenge,
      planAnswers: ["Observe the behavior", "Inspect the save path", "Check rejection"],
      revealedHints: [],
      failedVerifyAttempts: 0,
      status: "coding",
      thread: [],
    };
    expect(coachEscalation(base)).toBe("concept");
    expect(acceptsCoachFeedback("Try this:\n```ts\nconst previous = task;\n```", base)).toBe(false);
    expect(acceptsCoachFeedback("return tasks.filter((task) => !task.done);", base)).toBe(false);

    const levelTwo = { ...base, revealedHints: [{ level: 2, text: "Ask a sharper question." }] };
    expect(coachEscalation(levelTwo)).toBe("pseudocode");
    expect(acceptsCoachFeedback("Think in this pseudocode:\n```\nif saving fails, restore the earlier state\n```", levelTwo)).toBe(true);
    expect(acceptsCoachFeedback("Use src/task-manager.ts:42 for the fix.", levelTwo)).toBe(false);

    const levelThree = { ...levelTwo, revealedHints: [{ level: 3, text: "A location pointer." }] };
    expect(coachEscalation(levelThree)).toBe("partial");
    expect(acceptsCoachFeedback("A partial shape:\n```ts\nconst previous = current;\n```", levelThree)).toBe(true);
    expect(acceptsCoachFeedback("function completeTask() { return true; }", levelThree)).toBe(false);
  });

  it("redacts learner source-like text before it can enter coach context", () => {
    const redacted = redactCoachContext("const secretImplementation = () => { return true; };");
    expect(redacted).not.toContain("secretImplementation");
    expect(redacted).toMatch(/code omitted/i);
  });

  it("keeps ordinary punctuation and clock times in coaching context", () => {
    const prose = "The check ran at 12:30; compare the observed result with the expected behavior.";
    expect(redactCoachContext(prose)).toBe(prose);
    const base: CoachContext = {
      challenge: { } as CoachContext["challenge"],
      planAnswers: [],
      revealedHints: [],
      failedVerifyAttempts: 0,
      status: "coding",
      thread: [],
    };
    expect(acceptsCoachFeedback("Keep this question in mind; the tests decide.", base)).toBe(true);
  });

  it("uses the authored fallback and logs each exchange", async () => {
    const id = randomUUID();
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await saveSession(sessionRecord(id));
      const response = await coachRequest(id);
      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.coaching.source).toBe("authored");
      expect(payload.coaching.text).toMatch(/OPENAI_API_KEY/);
      const saved = await loadSession(id);
      expect(saved.coachThread).toHaveLength(0);
      expect(saved.timeline.at(-1)?.type).not.toBe("coach");
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });

  it("enforces the twelve learner-message ration", async () => {
    const id = randomUUID();
    const at = new Date().toISOString();
    const thread = Array.from({ length: 12 }, (_, index) => [
      { role: "learner" as const, text: `Question ${index}`, at },
      { role: "coach" as const, text: "Keep inspecting the evidence.", at, source: "authored" as const },
    ]).flat();
    try {
      await saveSession(sessionRecord(id, thread));
      const response = await coachRequest(id);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/limit of 12/i);
      expect((await loadSession(id)).coachThread).toHaveLength(24);
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });
});

describe("rejected coach exchanges", () => {
  it("append the learner question and authored rejection to the ration", async () => {
    const id = randomUUID();
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    const ai = await import("@/lib/ai");
    const message = vi.spyOn(ai, "coachMessage").mockResolvedValue({
      text: "Let us stay with the observed evidence and ask what the check can distinguish.",
      source: "authored",
      rejected: true,
    });
    try {
      await saveSession(sessionRecord(id));
      const response = await coachRequest(id, "What evidence should I compare?");
      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.used).toBe(1);
      const saved = await loadSession(id);
      expect(saved.coachThread.map((entry) => entry.role)).toEqual(["learner", "coach"]);
      expect(saved.coachThread.at(-1)?.source).toBe("authored");
      expect(saved.timeline.at(-1)).toMatchObject({ type: "coach", source: "authored" });
      expect(message).toHaveBeenCalledOnce();
    } finally {
      message.mockRestore();
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });
});
