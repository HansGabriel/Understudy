import { promises as fs } from "node:fs";
import { apiError } from "@/lib/api";
import { getChallenge, recommendNextChallenge, toPublicChallenge } from "@/lib/challenges";
import { assertFixtureAvailable } from "@/lib/fixture";
import { sampleSessionFixturePath } from "@/lib/paths";
import { sampleSessionFixtureSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertFixtureAvailable();
    const raw = await fs.readFile(sampleSessionFixturePath, "utf8");
    const fixture = sampleSessionFixtureSchema.parse(JSON.parse(raw));
    const challenge = await getChallenge(fixture.session.challengeId);
    return Response.json({
      session: fixture.session,
      challenge: toPublicChallenge(challenge),
      recommendedChallenge: await recommendNextChallenge([fixture.session.challengeId], fixture.session.projectId),
      diff: fixture.diff,
      learnerDiff: fixture.learnerDiff,
      referenceDiff: fixture.referenceDiff,
    });
  } catch (error) {
    return apiError(error);
  }
}
