import { canOpenVSCode, diffSummary } from "@/lib/git";
import { apiError } from "@/lib/api";
import { getChallenge, toPublicChallenge } from "@/lib/challenges";
import { loadSession } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/sessions/[id]">) {
  try {
    const { id } = await context.params;
    const session = await loadSession(id);
    const [canOpenInVSCode, diff, challenge] = await Promise.all([
      canOpenVSCode(),
      diffSummary(session.worktreePath).catch(() => ({ stat: "Worktree unavailable", shortstat: "" })),
      getChallenge(session.challengeId),
    ]);
    return Response.json({ session, canOpenInVSCode, diff, challenge: { ...toPublicChallenge(challenge), planQuestions: challenge.planQuestions } });
  } catch (error) {
    return apiError(error);
  }
}
