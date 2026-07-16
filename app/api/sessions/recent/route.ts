import { apiError } from "@/lib/api";
import { listChallenges } from "@/lib/challenges";
import { assertFixtureAvailable } from "@/lib/fixture";
import { sampleSessionId } from "@/lib/paths";
import { listSessions } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertFixtureAvailable();
    const [sessions, challenges] = await Promise.all([listSessions(), listChallenges()]);
    const titles = new Map(challenges.map((challenge) => [challenge.id, challenge.title]));
    const saved = sessions
      .filter((session) => session.id !== sampleSessionId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return Response.json({
      total: saved.length,
      sessions: saved.slice(0, 5).map((session) => ({
        id: session.id,
        challengeId: session.challengeId,
        challengeTitle: titles.get(session.challengeId) ?? session.challengeId,
        status: session.status,
        createdAt: session.createdAt,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
