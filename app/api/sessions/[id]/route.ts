import { canOpenVSCode, diffDetails, diffSummary, referenceDiff } from "@/lib/git";
import { apiError } from "@/lib/api";
import { getChallenge, recommendNextChallenge, toPublicChallenge } from "@/lib/challenges";
import { discardSession } from "@/lib/session-cleanup";
import { listSessions, loadSession } from "@/lib/sessions";
import { sessionIdSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/sessions/[id]">) {
  try {
    const { id } = await context.params;
    const session = await loadSession(id);
    const [canOpenInVSCode, diff, challenge, sessions] = await Promise.all([
      canOpenVSCode(),
      diffSummary(session.worktreePath).catch(() => ({ stat: "Worktree unavailable", shortstat: "", addedLines: [] })),
      getChallenge(session.challengeId),
      listSessions(),
    ]);
    const recommendedChallenge = await recommendNextChallenge(sessions.filter((item) => item.status === "completed" && item.projectId === session.projectId).map((item) => item.challengeId), session.projectId);
    if (session.status !== "completed") {
      return Response.json({ session, canOpenInVSCode, diff, recommendedChallenge, challenge: { ...toPublicChallenge(challenge), planQuestions: challenge.planQuestions } });
    }

    const [reference, learner] = await Promise.all([
      referenceDiff(challenge.baseCommit, challenge.referenceCommit, session.projectId).catch(() => ({
        commit: challenge.referenceCommit,
        patch: "Reference implementation unavailable. Run npm run fixture:build to restore it.",
        files: [],
      })),
      diffDetails(session.worktreePath).catch(() => ({ patch: "Worktree unavailable", files: [] })),
    ]);
    return Response.json({
      session,
      canOpenInVSCode,
      diff,
      recommendedChallenge,
      referenceDiff: reference,
      learnerDiff: learner,
      challenge: { ...toPublicChallenge(challenge), planQuestions: challenge.planQuestions },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/sessions/[id]">) {
  try {
    const { id } = await context.params;
    const sessionId = sessionIdSchema.parse(id);
    await discardSession(sessionId);
    return Response.json({ deleted: true, id: sessionId });
  } catch (error) {
    return apiError(error);
  }
}
