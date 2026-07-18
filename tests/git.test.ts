import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { diffDetails } from "@/lib/git";
import { sessionDirectory, sessionWorktreePath } from "@/lib/paths";

const execFile = promisify(execFileCallback);
const createdSessions: string[] = [];

afterEach(async () => {
  await Promise.all(createdSessions.splice(0).map((sessionId) => fs.rm(sessionDirectory(sessionId), { recursive: true, force: true })));
});

describe("learner diff guards", () => {
  it("includes staged changes when comparing the worktree with HEAD", async () => {
    const sessionId = randomUUID();
    createdSessions.push(sessionId);
    const worktree = sessionWorktreePath(sessionId);
    await fs.mkdir(worktree, { recursive: true });
    await execFile("git", ["-C", worktree, "init"]);
    await execFile("git", ["-C", worktree, "config", "user.email", "understudy-tests@example.com"]);
    await execFile("git", ["-C", worktree, "config", "user.name", "Understudy tests"]);
    const source = path.join(worktree, "change.txt");
    await fs.writeFile(source, "before\n", "utf8");
    await execFile("git", ["-C", worktree, "add", "change.txt"]);
    await execFile("git", ["-C", worktree, "commit", "-m", "baseline"]);
    await fs.writeFile(source, "before\nafter\n", "utf8");
    await execFile("git", ["-C", worktree, "add", "change.txt"]);

    const details = await diffDetails(worktree);
    expect(details.files).toEqual(["change.txt"]);
    expect(details.patch).toContain("+after");
  });
});
