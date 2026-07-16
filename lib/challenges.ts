import { promises as fs } from "node:fs";
import path from "node:path";
import { challengeSchema, publicChallengeSchema, type Challenge, type PublicChallenge } from "@/lib/schemas";
import { challengesRoot } from "@/lib/paths";
import { assertFixtureAvailable } from "@/lib/fixture";

const tags: Record<string, string> = {
  "optimistic-rollback": "async · error handling",
  "persist-filter": "persistence · validation",
};

export async function listChallenges(): Promise<Challenge[]> {
  const entries = await fs.readdir(challengesRoot, { withFileTypes: true });
  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const raw = await fs.readFile(path.join(challengesRoot, entry.name), "utf8");
        return challengeSchema.parse(JSON.parse(raw));
      }),
  );
  return manifests.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getChallenge(id: string): Promise<Challenge> {
  const challenge = (await listChallenges()).find((item) => item.id === id);
  if (!challenge) throw new Error("Challenge not found.");
  return challenge;
}

export function toPublicChallenge(challenge: Challenge): PublicChallenge {
  return publicChallengeSchema.parse({
    id: challenge.id,
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
  assertFixtureAvailable();
  return (await listChallenges()).map(toPublicChallenge);
}

export async function recommendNextChallenge(completedChallengeIds: Iterable<string>) {
  const completed = new Set(completedChallengeIds);
  const next = (await listChallenges())
    .filter((challenge) => !completed.has(challenge.id))
    .sort((left, right) => left.difficulty - right.difficulty || left.id.localeCompare(right.id))[0];
  return next ? toPublicChallenge(next) : null;
}
