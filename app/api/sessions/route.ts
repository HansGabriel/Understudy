import { createSessionInputSchema, type SessionRecord } from "@/lib/schemas";
import { createWorktree } from "@/lib/git";
import { getChallenge } from "@/lib/challenges";
import { createSessionRecord, listSessions } from "@/lib/sessions";
import { discardSession } from "@/lib/session-cleanup";
import { apiError, parseJson } from "@/lib/api";
import { sessionWorktreePath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newSession(challengeId: string, projectId: string, worktreePath: string, explainBackQuestion: string): Omit<SessionRecord, "id" | "createdAt"> {
  return {
    challengeId,
    projectId,
    worktreePath,
    status: "planning",
    plan: { answers: ["", "", ""], aiFeedback: "", aiSource: "authored", revisionCount: 0, confirmed: false },
    attempts: [],
    hints: [],
    explainBack: { question: explainBackQuestion, answer: "", aiFeedback: "", aiSource: "authored" },
    reflection: "",
    reflectionSource: "authored",
    lastCoaching: null,
    coachThread: [],
    timeline: [],
  };
}

export async function POST(request: Request) {
  try {
    const { challengeId } = createSessionInputSchema.parse(await parseJson(request));
    const challenge = await getChallenge(challengeId);
    const existingSessions = (await listSessions()).filter((session) => session.challengeId === challengeId);
    const passedSession = existingSessions.find((session) => session.status === "passed");
    if (passedSession) {
      return Response.json({
        error: "A passed session already exists. Resume it or discard it before starting a new replay.",
        sessionId: passedSession.id,
      }, { status: 409 });
    }
    const staleSessions = existingSessions.filter((session) => session.status === "planning" || session.status === "coding");
    for (const staleSession of staleSessions) {
      try {
        await discardSession(staleSession.id, { onlyIfStatus: ["planning", "coding"] });
      } catch (error) {
        console.warn(`Could not discard stale session ${staleSession.id}; continuing with a fresh worktree.`, error);
      }
    }
    const provisionalId = crypto.randomUUID();
    const worktreePath = sessionWorktreePath(provisionalId);
    await createWorktree(provisionalId, challenge.baseCommit, challenge.projectId);
    const session = await createSessionRecord({ ...newSession(challengeId, challenge.projectId, worktreePath, challenge.explainBackQuestion), id: provisionalId });
    return Response.json({ id: session.id, worktreePath: session.worktreePath }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
