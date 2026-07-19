import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { draftVariation } from "@/lib/ai";
import { ensureFixture, git } from "@/lib/git";
import { projectVariationDirectory, projectVariationBundlePath, saveHiddenFile, saveLinkedChallenge } from "@/lib/project-cache";
import { installProjectDependencies, runHiddenTest, runScript } from "@/lib/test-runner";
import { challengeSchema, type Challenge, type VariationProposal } from "@/lib/schemas";

const projectId = "task-manager";
const sourcePath = "src/task-manager.ts";

function safeRelative(value: string) {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part === "")) throw new Error("Variation contains an unsafe path.");
  return normalized;
}

async function writeTrackedFile(worktree: string, relativePath: string, content: string) {
  const normalized = safeRelative(relativePath);
  const destination = path.resolve(worktree, normalized);
  const relative = path.relative(worktree, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Variation contains an unsafe file path.");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, content, "utf8");
}

export async function validateVariation(baseCommit: string, proposal: VariationProposal, title: string) {
  if (proposal.sourcePath !== sourcePath) throw new Error("Variation must target the task-manager source file.");
  const fixture = await ensureFixture(baseCommit);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "understudy-variation-validation-"));
  const behavioralSource = path.join(os.tmpdir(), `understudy-variation-test-${Date.now()}-${Math.random().toString(16).slice(2)}.test.ts`);
  let worktreeAdded = false;
  try {
    await git(["-C", fixture, "worktree", "add", "--detach", temporary, baseCommit]);
    worktreeAdded = true;
    await installProjectDependencies(temporary);
    const normalAtBase = await runScript(temporary, "test");
    if (!normalAtBase.passed) throw new Error("Variation validation failed: the base normal suite did not pass.");
    await fs.writeFile(behavioralSource, proposal.behavioralTest, "utf8");
    const behavioralAtBase = await runHiddenTest(temporary, behavioralSource);
    if (behavioralAtBase.passed) throw new Error("Variation validation failed: the generated behavioral test passes at base.");
    await writeTrackedFile(temporary, proposal.sourcePath, proposal.referenceSource);
    const normalAtReference = await runScript(temporary, "test");
    if (!normalAtReference.passed) throw new Error("Variation validation failed: the generated reference breaks the normal suite.");
    const behavioralAtReference = await runHiddenTest(temporary, behavioralSource);
    if (!behavioralAtReference.passed) throw new Error("Variation validation failed: the generated behavioral test does not pass at reference.");
    await git(["-C", temporary, "add", "--", proposal.sourcePath]);
    await git(["-C", temporary, "-c", "user.name=Understudy Forge", "-c", "user.email=forge@understudy.local", "commit", "-m", title]);
    const referenceCommit = await git(["-C", temporary, "rev-parse", "HEAD"]);
    const variationId = `variation-${baseCommit.slice(0, 12)}-${referenceCommit.slice(0, 12)}`;
    await fs.mkdir(projectVariationDirectory(projectId), { recursive: true });
    const bundlePath = projectVariationBundlePath(projectId, variationId);
    await git(["-C", fixture, "update-ref", `refs/understudy/variations/${variationId}`, referenceCommit]);
    await git(["-C", fixture, "bundle", "create", bundlePath, "--all"]);
    return { referenceCommit, variationId, bundlePath };
  } finally {
    await fs.rm(behavioralSource, { force: true });
    if (worktreeAdded) await git(["-C", fixture, "worktree", "remove", "--force", temporary]).catch(() => undefined);
    await git(["-C", fixture, "worktree", "prune"]).catch(() => undefined);
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

export async function publishVariation(baseChallenge: Challenge, proposal: VariationProposal) {
  if (baseChallenge.projectId !== projectId) throw new Error("Forge variations are available for the built-in task-manager project only.");
  const validation = await validateVariation(baseChallenge.referenceCommit, proposal, `Understudy variation: ${proposal.title}`);
  const hiddenTestFile = await saveHiddenFile(projectId, validation.referenceCommit, "tests/challenge.test.ts", proposal.behavioralTest);
  const challenge = challengeSchema.parse({
    id: validation.variationId,
    projectId,
    drafted: true,
    draftedBy: "ai",
    mode: "replay",
    title: proposal.title,
    baseCommit: baseChallenge.referenceCommit,
    referenceCommit: validation.referenceCommit,
    difficulty: proposal.difficulty,
    estimatedTime: proposal.estimatedTime,
    testCommand: "test",
    hiddenTestCommand: "test:challenge",
    hiddenTestFile,
    hiddenTestFiles: [{ source: hiddenTestFile, relativePath: "tests/challenge.test.ts" }],
    behavioralCheck: "hidden",
    learningObjectives: proposal.learningObjectives,
    brief: proposal.brief,
    planQuestions: proposal.planQuestions,
    hints: proposal.hints,
    explainBackQuestion: proposal.explainBackQuestion,
  });
  await saveLinkedChallenge(challenge);
  return challenge;
}

export async function generateAndPublishVariation(baseChallenge: Challenge, guidance?: string) {
  if (baseChallenge.projectId !== projectId) throw new Error("Forge variations are available for the built-in task-manager project only.");
  const fixture = await ensureFixture(baseChallenge.referenceCommit);
  const referenceSource = await git(["-C", fixture, "show", `${baseChallenge.referenceCommit}:${sourcePath}`], fixture);
  const proposal = await draftVariation({ challenge: baseChallenge, referenceSource, guidance });
  if (!proposal) throw new Error("Forge needs an OPENAI_API_KEY and a valid GPT-5.6 variation before it can publish anything.");
  return publishVariation(baseChallenge, proposal);
}
