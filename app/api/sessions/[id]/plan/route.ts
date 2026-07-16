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
      const challenge = await getChallenge(current.challengeId);
      const coaching = await planFeedback(answers, challenge);
      current.plan = { answers, aiFeedback: coaching.text, aiSource: coaching.source };
      current.status = "coding";
      return appendTimeline(current, "plan_submitted", { answerCount: answers.length }, coaching.source);
    });
    return Response.json(session.plan);
  } catch (error) {
    return apiError(error);
  }
}
