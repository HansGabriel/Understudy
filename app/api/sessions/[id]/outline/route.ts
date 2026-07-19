import { approachOutline } from "@/lib/ai";
import { apiError } from "@/lib/api";
import { getChallenge } from "@/lib/challenges";
import { sessionIdSchema } from "@/lib/schemas";
import { appendTimeline, updateSession } from "@/lib/sessions";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/sessions/[id]/outline">) {
  try {
    const { id } = await context.params;
    const sessionId = sessionIdSchema.parse(id);
    const session = await updateSession(sessionId, async (current) => {
      if (!current.plan.confirmed) throw new Error("Confirm your plan before requesting an approach outline.");
      if (current.status === "passed" || current.status === "completed") throw new Error("An approach outline is only available while you are coding.");
      if (current.outline) return current;
      const challenge = await getChallenge(current.challengeId);
      const coaching = await approachOutline(challenge, current.plan.answers);
      current.outline = { steps: coaching.outline.steps, at: new Date().toISOString(), source: coaching.source };
      current.lastCoaching = coaching;
      return appendTimeline(current, "outline", { steps: coaching.outline.steps.length }, coaching.source);
    });
    return Response.json({ outline: session.outline });
  } catch (error) {
    return apiError(error);
  }
}
