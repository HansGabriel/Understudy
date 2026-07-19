import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { listChallenges, listPublicChallenges, recommendNextChallenge } from "@/lib/challenges";
import { sessionDirectory, sessionWorktreePath } from "@/lib/paths";
import { loadSession, saveSession } from "@/lib/sessions";
import { challengeSchema, sessionSchema, type SessionRecord } from "@/lib/schemas";
import { referenceDiff } from "@/lib/git";
import { projectChallengesDirectory } from "@/lib/project-cache";

vi.mock("@/lib/git", () => ({
  canOpenVSCode: vi.fn(async () => false),
  createWorktree: vi.fn(async () => undefined),
  diffDetails: vi.fn(async () => ({ patch: "learner patch", files: ["src/task-manager.ts"] })),
  diffSummary: vi.fn(async () => ({ stat: "", shortstat: "" })),
  removeWorktree: vi.fn(async () => undefined),
  referenceDiff: vi.fn(async () => ({ commit: "9f27b6c7a0c92636f543f2d4874a4863d6624254", patch: "reference patch", files: ["src/task-manager.ts"] })),
}));

import { GET as getSession } from "@/app/api/sessions/[id]/route";
import { POST as createSession } from "@/app/api/sessions/route";

describe("challenge projection", () => {
  it("skips a corrupt linked-cache manifest without hiding built-in challenges", async () => {
    const directory = projectChallengesDirectory("task-manager");
    const corruptPath = path.join(directory, "corrupt-review-manifest.json");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(corruptPath, "{not-json", "utf8");
    try {
      const challenges = await listChallenges();
      expect(challenges.some((challenge) => challenge.id === "optimistic-rollback")).toBe(true);
    } finally {
      await fs.rm(corruptPath, { force: true });
    }
  });
  it("keeps reference commits, hidden paths, hints, and plan prompts off the browser contract", async () => {
    const internal = (await listChallenges()).find((challenge) => challenge.id === "optimistic-rollback")!;
    const publicChallenges = await listPublicChallenges();
    const publicPayload = JSON.stringify(publicChallenges);
    expect(publicChallenges.filter((challenge) => challenge.projectId === "task-manager")).toHaveLength(2);
    expect(publicPayload).not.toContain(internal.referenceCommit);
    expect(publicPayload).not.toContain(internal.hiddenTestFile);
    expect(publicPayload).not.toContain(internal.hints[0].text);
    expect(publicPayload).not.toContain(internal.planQuestions[0]);
  });

  it("recommends the easiest unfinished challenge and returns none when all are complete", async () => {
    const recommendation = await recommendNextChallenge(["optimistic-rollback"]);
    expect(recommendation?.id).toBe("persist-filter");
    expect(await recommendNextChallenge(["optimistic-rollback", "persist-filter"])).toBeNull();
  });

  it("describes the headless TypeScript practice project without promising a browser UI", async () => {
    const challenges = await listChallenges();
    const optimistic = challenges.find((challenge) => challenge.id === "optimistic-rollback");
    const persisted = challenges.find((challenge) => challenge.id === "persist-filter");
    expect(optimistic?.brief.desiredBehavior).toContain("data layer of a task-manager app");
    expect(persisted?.brief.desiredBehavior).toContain("data layer of a task-manager app");
    expect(JSON.stringify(challenges.map((challenge) => challenge.brief))).not.toMatch(/checkbox/i);
    expect(optimistic?.brief.constraints).toContain("Work in the TypeScript task-manager library; this fixture has no browser screen.");
  });

  it("defaults project identity for legacy challenge and session records", async () => {
    const [challenge] = await listChallenges();
    expect(challengeSchema.parse({ ...challenge, projectId: undefined }).projectId).toBe("task-manager");
    const legacy = { ...sessionRecord(randomUUID(), "planning"), projectId: undefined };
    expect(sessionSchema.parse(legacy).projectId).toBe("task-manager");
  });
});

function sessionRecord(id: string, status: SessionRecord["status"]): SessionRecord {
  return {
    id,
    challengeId: "optimistic-rollback",
    projectId: "task-manager",
    createdAt: new Date().toISOString(),
    worktreePath: sessionWorktreePath(id),
    status,
    plan: { answers: ["behavior", "investigation", "edge case"], aiFeedback: "", revisionCount: 0, confirmed: false },
    attempts: [],
    hints: [],
    explainBack: { question: "Why?", answer: status === "completed" ? "Because state can be restored." : "", aiFeedback: "" },
    reflection: "",
    reflectionBullets: [],
    timeline: [],
    coachThread: [],
  };
}

async function getSessionPayload(id: string) {
  const response = await getSession(new Request("http://localhost/api/sessions/" + id), { params: Promise.resolve({ id }) } as never);
  expect(response.status).toBe(200);
  return response.json();
}

describe("session reference reveal", () => {
  it("does not expose reference history before completion", async () => {
    const id = randomUUID();
    try {
      await saveSession(sessionRecord(id, "passed"));
      const payload = await getSessionPayload(id);
      const serialized = JSON.stringify(payload);
      expect(payload).not.toHaveProperty("referenceDiff");
      expect(payload).not.toHaveProperty("learnerDiff");
      expect(serialized).not.toContain("9f27b6c7a0c92636f543f2d4874a4863d6624254");
      expect(serialized).not.toContain("reference patch");
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });

  it("reveals the reference commit, patch, and files after completion", async () => {
    const id = randomUUID();
    try {
      await saveSession(sessionRecord(id, "completed"));
      const payload = await getSessionPayload(id);
      expect(payload.referenceDiff).toEqual({
        commit: "9f27b6c7a0c92636f543f2d4874a4863d6624254",
        patch: "reference patch",
        files: ["src/task-manager.ts"],
      });
      expect(payload.learnerDiff).toEqual({ patch: "learner patch", files: ["src/task-manager.ts"] });
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });

  it("degrades a completed report when the reference repository is unavailable", async () => {
    const id = randomUUID();
    try {
      await saveSession(sessionRecord(id, "completed"));
      vi.mocked(referenceDiff).mockRejectedValueOnce(new Error("fixture unavailable"));
      const payload = await getSessionPayload(id);
      expect(payload.referenceDiff.patch).toMatch(/unavailable/i);
      expect(payload.learnerDiff).toEqual({ patch: "learner patch", files: ["src/task-manager.ts"] });
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });

  it("does not auto-discard a passed session when starting another replay", async () => {
    const id = randomUUID();
    try {
      await saveSession(sessionRecord(id, "passed"));
      const response = await createSession(new Request("http://localhost/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: "optimistic-rollback" }),
      }));
      const payload = await response.json();
      expect(response.status).toBe(409);
      expect(payload.sessionId).toBe(id);
      expect((await loadSession(id)).status).toBe("passed");
    } finally {
      await fs.rm(sessionDirectory(id), { recursive: true, force: true });
    }
  });
});
