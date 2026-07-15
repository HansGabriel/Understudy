import { createSessionInputSchema, type SessionRecord } from "@/lib/schemas";
import { createWorktree } from "@/lib/git";
import { getChallenge } from "@/lib/challenges";
import { createSessionRecord } from "@/lib/sessions";
import { apiError, parseJson } from "@/lib/api";
import { sessionWorktreePath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newSession(challengeId: string, worktreePath: string, explainBackQuestion: string): Omit<SessionRecord, "id" | "createdAt"> {
  return {
    challengeId,
    worktreePath,
    status: "planning",
    plan: { answers: ["", "", ""], aiFeedback: "" },
    attempts: [],
    hints: [],
    explainBack: { question: explainBackQuestion, answer: "", aiFeedback: "" },
    reflection: "",
    timeline: [],
  };
}

export async function POST(request: Request) {
  try {
    const { challengeId } = createSessionInputSchema.parse(await parseJson(request));
    const challenge = await getChallenge(challengeId);
    const provisionalId = crypto.randomUUID();
    const worktreePath = sessionWorktreePath(provisionalId);
    await createWorktree(provisionalId, challenge.baseCommit);
    const session = await createSessionRecord({ ...newSession(challengeId, worktreePath, challenge.explainBackQuestion), id: provisionalId });
    return Response.json({ id: session.id, worktreePath: session.worktreePath }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
