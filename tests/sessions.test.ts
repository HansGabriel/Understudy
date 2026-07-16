import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendTimeline, loadSession, saveSession } from "@/lib/sessions";
import { sampleSessionFixturePath, sampleSessionId, sessionDirectory } from "@/lib/paths";
import { sampleSessionFixtureSchema, type SessionRecord } from "@/lib/schemas";
import { GET as getRecentSessions } from "@/app/api/sessions/recent/route";
import { GET as getSampleSession } from "@/app/api/sample-session/route";
import { POST as submitPlan } from "@/app/api/sessions/[id]/plan/route";
import { POST as confirmPlan } from "@/app/api/sessions/[id]/plan/confirm/route";
import { discardSession } from "@/lib/session-cleanup";

function testSession(id: string): SessionRecord {
  return {
    id,
    challengeId: "optimistic-rollback",
    createdAt: new Date().toISOString(),
    worktreePath: `runtime/sessions/${id}/worktree`,
    status: "planning",
    plan: { answers: ["", "", ""], aiFeedback: "", revisionCount: 0, confirmed: false },
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

  it("round-trips coaching source labels on timeline events", async () => {
    const id = randomUUID();
    const record = appendTimeline(testSession(id), "plan_submitted", { answerCount: 3 }, "ai");
    try {
      await saveSession(record);
      expect((await loadSession(id)).timeline[0].source).toBe("ai");
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });

  it("projects saved sessions for the recent sidebar without sample records", async () => {
    const id = randomUUID();
    const record = testSession(id);
    try {
      await saveSession(record);
      const response = await getRecentSessions();
      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.sessions).toEqual(expect.arrayContaining([
        expect.objectContaining({ id, challengeId: record.challengeId, status: record.status }),
      ]));
      expect(payload.sessions.every((session: { id: string }) => session.id !== sampleSessionId)).toBe(true);
      expect(payload.total).toBeGreaterThanOrEqual(1);
      expect(payload.challengeStates[record.challengeId]).toEqual({ id, status: record.status });
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });

  it("validates the seeded sample session through the real schema", async () => {
    const raw = await fs.readFile(sampleSessionFixturePath, "utf8");
    const fixture = sampleSessionFixtureSchema.parse(JSON.parse(raw));
    expect(fixture.session.status).toBe("completed");
    expect(fixture.referenceDiff.commit).toHaveLength(40);
    expect(fixture.referenceDiff.files).toContain("src/task-manager.ts");
  });

  it("serves the seeded report with its reference reveal", async () => {
    const response = await getSampleSession();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.session.status).toBe("completed");
    expect(payload.referenceDiff.commit).toBe("e4c0b5b8e569ce9772e1709e460334da5b0f3222");
    expect(payload.learnerDiff.files).toContain("src/task-manager.ts");
  });

  it("does not discard a session whose status changed while cleanup was queued", async () => {
    const id = randomUUID();
    const planning = testSession(id);
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    try {
      await saveSession(planning);
      const lock = import("@/lib/sessions").then(({ withSessionLock }) => withSessionLock(id, async () => {
        enter();
        await held;
      }));
      await entered;
      const pendingDiscard = discardSession(id, { onlyIfStatus: ["planning", "coding"] });
      await saveSession({ ...planning, status: "completed", explainBack: { ...planning.explainBack, answer: "explained" } });
      release();
      await lock;
      expect(await pendingDiscard).toBeNull();
      expect((await loadSession(id)).status).toBe("completed");
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });

  it("shows plan coaching, permits one revision, then requires confirmation", async () => {
    const id = randomUUID();
    const context = { params: Promise.resolve({ id }) } as never;
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await saveSession(testSession(id));
      const first = await submitPlan(new Request(`http://localhost/api/sessions/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: ["Observe the immediate task change", "Inspect the completion and save path", "A rejected save must restore the old task"] }),
      }), context);
      expect(first.status).toBe(200);
      expect((await loadSession(id)).plan.confirmed).toBe(false);

      const revision = await submitPlan(new Request(`http://localhost/api/sessions/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: ["Show completion immediately", "Trace the task manager mutation", "A failed save must restore the prior state"] }),
      }), context);
      expect(revision.status).toBe(200);
      expect((await loadSession(id)).plan.revisionCount).toBe(1);

      const confirmation = await confirmPlan(new Request(`http://localhost/api/sessions/${id}/plan/confirm`, { method: "POST" }), context);
      expect(confirmation.status).toBe(200);
      expect((await loadSession(id)).plan.confirmed).toBe(true);
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });
});
