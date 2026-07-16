import { getChallenge } from "@/lib/challenges";
import { apiError, parseJson } from "@/lib/api";
import { planInputSchema } from "@/lib/schemas";
import { appendTimeline, updateSession } from "@/lib/sessions";
import { planFeedback } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/plan">) {
  try {
    const { id } = await context.params;
    const { answers } = planInputSchema.parse(await parseJson(request));
    const session = await updateSession(id, async (current) => {
      if (current.status !== "planning" && current.status !== "coding") throw new Error("The planning checkpoint is already closed.");
      if (current.plan.confirmed) throw new Error("This plan is already confirmed.");
      if (current.status === "coding" && current.plan.revisionCount >= 1) throw new Error("The one optional plan revision has already been used.");
      const challenge = await getChallenge(current.challengeId);
      const coaching = await planFeedback(answers, challenge);
      current.plan = {
        answers,
        aiFeedback: coaching.text,
        aiSource: coaching.source,
        revisionCount: current.status === "coding" ? 1 : current.plan.revisionCount,
        confirmed: false,
      };
      current.status = "coding";
      return appendTimeline(current, "plan_submitted", { answerCount: answers.length, revision: current.plan.revisionCount }, coaching.source);
    });
    return Response.json(session.plan);
  } catch (error) {
    return apiError(error);
  }
}
