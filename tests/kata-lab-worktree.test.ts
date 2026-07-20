import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { getChallenge } from "@/lib/challenges";
import { createWorktree, removeWorktree } from "@/lib/git";
import { sessionWorktreePath } from "@/lib/paths";

const execFile = promisify(execFileCallback);

describe("Kata Lab worktrees", () => {
  it("creates an isolated working copy from the kata fixture history", async () => {
    const sessionId = randomUUID();
    const challenge = await getChallenge("count-vowels");

    try {
      const worktree = await createWorktree(sessionId, challenge.baseCommit, challenge.projectId);
      expect(worktree).toBe(sessionWorktreePath(sessionId));
      await fs.access(worktree);
      const revision = await execFile("git", ["-C", worktree, "rev-parse", "HEAD"], { windowsHide: true });
      expect(revision.stdout.trim()).toBe(challenge.baseCommit);
    } finally {
      await removeWorktree(sessionId, "kata-lab").catch(() => undefined);
    }
  }, 120_000);
});
