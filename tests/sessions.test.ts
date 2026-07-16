import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendTimeline, loadSession, saveSession } from "@/lib/sessions";
import { sampleSessionFixturePath, sampleSessionId, sessionDirectory } from "@/lib/paths";
import { sampleSessionFixtureSchema, type SessionRecord } from "@/lib/schemas";
import { GET as getRecentSessions } from "@/app/api/sessions/recent/route";
import { GET as getSampleSession } from "@/app/api/sample-session/route";
import { discardSession } from "@/lib/session-cleanup";

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
});
