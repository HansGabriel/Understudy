import { promises as fs } from "node:fs";
import path from "node:path";
import { challengeSchema, publicChallengeSchema, type Challenge, type PublicChallenge } from "@/lib/schemas";
import { challengesRoot } from "@/lib/paths";
import { assertAllFixturesAvailable } from "@/lib/fixture";
import { listProjects } from "@/lib/projects";
import { listLinkedChallenges } from "@/lib/project-cache";

const tags: Record<string, string> = {
  "count-vowels": "strings / basics",
  "find-unique-number": "arrays / counting",
  "balanced-brackets": "stacks / parsing",
  "two-sum-indices": "arrays / lookup",
  "optimistic-rollback": "async · error handling",
  "persist-filter": "persistence · validation",
};

export async function listChallenges(): Promise<Challenge[]> {
  const entries = await fs.readdir(challengesRoot, { withFileTypes: true });
  const manifests = (await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        try {
          const raw = await fs.readFile(path.join(challengesRoot, entry.name), "utf8");
          return challengeSchema.parse(JSON.parse(raw));
        } catch (error) {
          console.warn(`Understudy: skipping invalid built-in challenge ${entry.name}.`, error);
          return null;
        }
      }),
  )).filter((challenge): challenge is Challenge => challenge !== null);
  const projectIds = (await listProjects()).map((project) => project.id);
  const generated = await Promise.all([...new Set(projectIds)].map((projectId) => listLinkedChallenges(projectId)));
  const projectOrder: Record<string, number> = { "kata-lab": 0, "task-manager": 1 };
  return [...manifests, ...generated.flat()].sort((a, b) => (
    (projectOrder[a.projectId] ?? 99) - (projectOrder[b.projectId] ?? 99)
    || a.libraryOrder - b.libraryOrder
    || a.title.localeCompare(b.title)
  ));
}

export async function getChallenge(id: string): Promise<Challenge> {
  const challenge = (await listChallenges()).find((item) => item.id === id);
  if (!challenge) throw new Error("Challenge not found.");
  return challenge;
}

export function toPublicChallenge(challenge: Challenge): PublicChallenge {
  return publicChallengeSchema.parse({
    id: challenge.id,
    projectId: challenge.projectId,
    libraryOrder: challenge.libraryOrder,
    drafted: challenge.drafted,
    draftedBy: challenge.draftedBy,
    behavioralCheck: challenge.behavioralCheck,
    mode: challenge.mode,
    title: challenge.title,
    difficulty: challenge.difficulty,
    estimatedTime: challenge.estimatedTime,
    learningObjectives: challenge.learningObjectives,
    brief: challenge.brief,
    tag: tags[challenge.id] ?? "guided practice",
  });
}

export async function listPublicChallenges() {
  assertAllFixturesAvailable();
  return (await listChallenges()).map(toPublicChallenge);
}

export async function recommendNextChallenge(completedChallengeIds: Iterable<string>, projectId = "task-manager") {
  const completed = new Set(completedChallengeIds);
  const next = (await listChallenges())
    .filter((challenge) => challenge.projectId === projectId && !completed.has(challenge.id) && (challenge.projectId === "task-manager" ? !challenge.drafted : challenge.drafted))
    .sort((left, right) => left.libraryOrder - right.libraryOrder || left.difficulty - right.difficulty || left.id.localeCompare(right.id))[0];
  return next ? toPublicChallenge(next) : null;
}
