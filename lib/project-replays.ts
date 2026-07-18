import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { draftChallengeFromCommit } from "@/lib/ai";
import { getProject } from "@/lib/projects";
import { installProjectDependencies, runScriptWithArgs } from "@/lib/test-runner";
import { projectHiddenFilePath, readValidationCache, saveHiddenFile, saveLinkedChallenge, saveValidationCache } from "@/lib/project-cache";
import { challengeSchema, projectCommitSchema, projectCommitValidationSchema, type Challenge, type ChallengeDraft, type ProjectCommit, type ProjectCommitValidation } from "@/lib/schemas";
import { assertAbsoluteLocalPath } from "@/lib/paths";

const execFile = promisify(execFileCallback);
const testPathPattern = /(^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i;

async function runGit(repository: string, args: string[], maxBuffer = 2_000_000) {
  try {
    const result = await execFile("git", ["-C", repository, ...args], { windowsHide: true, timeout: 120_000, maxBuffer });
    return result.stdout.trim();
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(`${detail.stdout ?? ""}\n${detail.stderr ?? detail.message ?? "Git command failed."}`.trim());
  }
}

async function commitParent(repository: string, sha: string) {
  const line = await runGit(repository, ["rev-list", "--parents", "-n", "1", sha]);
  const parents = line.split(/\s+/).filter(Boolean);
  return parents[1] ?? null;
}

async function changedFiles(repository: string, parent: string | null, sha: string) {
  const output = parent
    ? await runGit(repository, ["diff", "--name-status", "-M", parent, sha, "--"])
    : await runGit(repository, ["diff-tree", "--root", "--name-status", "-M", sha, "--"]);
  const entries = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\t+/);
    return { status: parts[0] ?? "", path: parts.at(-1) ?? "" };
  });
  return { entries, files: entries.map((entry) => entry.path).filter(Boolean) };
}

function safeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part === "")) throw new Error("Unsafe commit test path.");
  return normalized;
}

function badge(status: ProjectCommitValidation["status"] | "pending") {
  if (status === "replayable") return "replayable · self-validating";
  if (status === "pending") return "validates on create";
  if (status === "unverified") return "validation will retry on create";
  return "no automatic edge-case check";
}

export async function validateCommit(projectId: string, repository: string, sha: string, parent: string | null, addedTestPaths: string[]): Promise<ProjectCommitValidation> {
  const cached = await readValidationCache(projectId, sha, (value) => projectCommitValidationSchema.parse(value));
  if (cached && cached.status !== "unverified") return cached;
  const result: ProjectCommitValidation = { sha, status: "not-replayable", checkedAt: new Date().toISOString() };
  if (!parent || !addedTestPaths.length) {
    await saveValidationCache(projectId, sha, result);
    return result;
  }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "understudy-commit-validation-"));
  let worktreeAdded = false;
  try {
    await runGit(repository, ["worktree", "add", "--detach", temporary, parent]);
    worktreeAdded = true;
    await installProjectDependencies(temporary);
    const sourceFiles = await Promise.all(addedTestPaths.map(async (relativePath) => ({ relativePath, content: await runGit(repository, ["show", `${sha}:${relativePath}`], 4_000_000) })));
    for (const entry of sourceFiles) {
      const target = path.resolve(temporary, entry.relativePath);
      const relative = path.relative(temporary, target);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Unsafe commit test destination.");
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, entry.content, "utf8");
    }
    const parentResult = await runScriptWithArgs(temporary, "test", addedTestPaths);
    for (const entry of sourceFiles) await fs.rm(path.resolve(temporary, entry.relativePath), { force: true });
    await runGit(temporary, ["checkout", "--detach", sha]);
    const referenceResult = await runScriptWithArgs(temporary, "test", addedTestPaths);
    if (!parentResult.passed && referenceResult.passed) result.status = "replayable";
  } catch (error) {
    const detail = error as { message?: string; stdout?: string; stderr?: string };
    return {
      sha,
      status: "unverified",
      checkedAt: new Date().toISOString(),
      error: `${detail.stderr ?? detail.stdout ?? detail.message ?? "Validation could not complete."}`.slice(0, 1000),
    };
  } finally {
    if (worktreeAdded) await runGit(repository, ["worktree", "remove", "--force", temporary]).catch(() => undefined);
    await runGit(repository, ["worktree", "prune"]).catch(() => undefined);
    await fs.rm(temporary, { recursive: true, force: true });
  }
  await saveValidationCache(projectId, sha, result);
  return result;
}

export async function listProjectCommits(projectId: string): Promise<ProjectCommit[]> {
  const project = await getProject(projectId);
  if (project.mode !== "linked") throw new Error("Commit replay is available for linked projects only.");
  const repository = assertAbsoluteLocalPath(project.path!);
  const log = await runGit(repository, ["log", "-50", "--date=iso-strict", "--format=%H%x09%aI%x09%s"]);
  const commits: ProjectCommit[] = [];
  for (const line of log.split(/\r?\n/).filter(Boolean)) {
    const [sha, date, ...subjectParts] = line.split("\t");
    if (!sha || !date) continue;
    const parent = await commitParent(repository, sha);
    const changed = await changedFiles(repository, parent, sha);
    const addedTestPaths = changed.entries.filter((entry) => entry.status.startsWith("A") && testPathPattern.test(entry.path)).map((entry) => safeRelativePath(entry.path));
    const validation = addedTestPaths.length
      ? await readValidationCache(projectId, sha, (value) => projectCommitValidationSchema.parse(value))
      : null;
    const validationStatus = validation?.status ?? (addedTestPaths.length ? "pending" : "not-replayable");
    const replayable = validationStatus === "replayable";
    commits.push(projectCommitSchema.parse({
      sha,
      subject: subjectParts.join("\t"),
      date: new Date(date).toISOString(),
      filesChanged: changed.files,
      addsTests: addedTestPaths.length > 0,
      replayable,
      badge: badge(validationStatus),
      validationStatus,
    }));
  }
  return commits;
}

async function commitContext(projectId: string, shaInput: string) {
  const project = await getProject(projectId);
  if (project.mode !== "linked") throw new Error("Commit replay is available for linked projects only.");
  const repository = assertAbsoluteLocalPath(project.path!);
  const commits = await listProjectCommits(projectId);
  const commit = commits.find((entry) => entry.sha.toLowerCase().startsWith(shaInput.toLowerCase()));
  if (!commit) throw new Error("Choose a commit from the recent commit list.");
  const parent = await commitParent(repository, commit.sha);
  if (!parent) throw new Error("The selected root commit has no parent to replay.");
  const changed = await changedFiles(repository, parent, commit.sha);
  const testPaths = changed.entries.filter((entry) => entry.status.startsWith("A") && testPathPattern.test(entry.path)).map((entry) => safeRelativePath(entry.path));
  const validation = testPaths.length ? await validateCommit(projectId, repository, commit.sha, parent, testPaths) : null;
  const validationStatus = validation?.status ?? "not-replayable";
  const validatedCommit = projectCommitSchema.parse({ ...commit, replayable: validationStatus === "replayable", validationStatus, badge: badge(validationStatus) });
  return { project, repository, commit: validatedCommit, parent, testPaths };
}

function blankDraft(subject: string, sha: string): ChallengeDraft {
  return {
    title: subject.trim() || `Replay commit ${sha.slice(0, 7)}`,
    difficulty: 3,
    estimatedTime: "20–30 min",
    learningObjectives: ["Trace a real change", "Use tests as evidence"],
    brief: {
      desiredBehavior: "Describe the observable behavior this change should add.",
      acceptanceCriteria: ["Name the primary behavior to observe.", "Name an edge case or failure path.", "Name the existing behavior that must remain true."],
      constraints: ["Work in the linked repository's TypeScript data layer.", "Preserve existing behavior and use the project's patterns."],
    },
    planQuestions: ["What should a user or caller observe after this change?", "Which existing behavior and tests will you inspect first?", "What edge case would prove the change is complete?"],
    hints: [
      { level: 1, text: "Start with the observable behavior named in the brief." },
      { level: 2, text: "Which existing state or contract must remain true while the new behavior is added?" },
      { level: 3, text: "Inspect the smallest area of the repository connected to the commit's stated behavior." },
    ],
    explainBackQuestion: "What behavior did this change add, and how did the tests prove it?",
  };
}

export function challengeDraftView(challenge: Challenge): ChallengeDraft {
  return {
    title: challenge.title,
    difficulty: challenge.difficulty,
    estimatedTime: challenge.estimatedTime,
    learningObjectives: challenge.learningObjectives,
    brief: challenge.brief,
    planQuestions: challenge.planQuestions,
    hints: challenge.hints,
    explainBackQuestion: challenge.explainBackQuestion,
  };
}

export async function createLinkedChallenge(projectId: string, shaInput: string) {
  const context = await commitContext(projectId, shaInput);
  const drafted = await draftChallengeFromCommit({
    subject: context.commit.subject,
    body: await runGit(context.repository, ["show", "-s", "--format=%B", context.commit.sha]),
    stat: await runGit(context.repository, ["diff", "--stat", context.parent, context.commit.sha, "--"]),
  });
  const draft = drafted ?? blankDraft(context.commit.subject, context.commit.sha);
  const hiddenTestFiles = context.commit.replayable
    ? await Promise.all(context.testPaths.map(async (relativePath) => ({
        source: await saveHiddenFile(projectId, context.commit.sha, relativePath, await runGit(context.repository, ["show", `${context.commit.sha}:${relativePath}`], 4_000_000)),
        relativePath,
      })))
    : [];
  const challenge = challengeSchema.parse({
    id: `${projectId}-${context.commit.sha.slice(0, 12)}`,
    projectId,
    drafted: Boolean(drafted),
    draftedBy: drafted ? "ai" : undefined,
    mode: "replay",
    title: draft.title,
    baseCommit: context.parent,
    referenceCommit: context.commit.sha,
    difficulty: draft.difficulty,
    estimatedTime: draft.estimatedTime,
    testCommand: context.project.detected.testCommand,
    hiddenTestCommand: context.commit.replayable ? "test" : context.project.detected.testCommand,
    hiddenTestFile: hiddenTestFiles[0]?.source ?? projectHiddenFilePath(projectId, context.commit.sha, "no-hidden-test.txt"),
    hiddenTestFiles,
    behavioralCheck: context.commit.replayable ? "hidden" : "full-suite",
    learningObjectives: draft.learningObjectives,
    brief: draft.brief,
    planQuestions: draft.planQuestions,
    hints: draft.hints,
    explainBackQuestion: draft.explainBackQuestion,
  });
  await saveLinkedChallenge(challenge);
  return { challenge, source: drafted ? "ai" as const : "blank" as const, commit: context.commit };
}

export async function updateLinkedChallengeDraft(projectId: string, challengeId: string, draft: ChallengeDraft) {
  const context = await getProject(projectId);
  if (context.mode !== "linked") throw new Error("Draft editing is available for linked projects only.");
  const { getChallenge } = await import("@/lib/challenges");
  const { listSessions } = await import("@/lib/sessions");
  const existing = await getChallenge(challengeId);
  if (existing.projectId !== projectId) throw new Error("Challenge does not belong to this project.");
  if ((await listSessions()).some((session) => session.challengeId === challengeId)) throw new Error("Draft editing is only available before first use.");
  const challenge = challengeSchema.parse({ ...existing, ...draft, drafted: true, draftedBy: "learner" });
  await saveLinkedChallenge(challenge);
  return challenge;
}
