import { reflection } from "@/lib/ai";
import { apiError, parseJson } from "@/lib/api";
import { explainInputSchema } from "@/lib/schemas";
import { appendTimeline, updateSession } from "@/lib/sessions";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/explain">) {
  try {
    const { id } = await context.params;
    const { answer } = explainInputSchema.parse(await parseJson(request));
    const session = await updateSession(id, async (current) => {
      if (current.status !== "passed") throw new Error("Pass all checks before completing the explanation.");
      current.explainBack.answer = answer;
      const coaching = await reflection(current);
      current.reflection = coaching.text;
      current.reflectionSource = coaching.source;
      current.explainBack.aiFeedback = coaching.text;
      current.explainBack.aiSource = coaching.source;
      current.status = "completed";
      return appendTimeline(current, "explained", {}, coaching.source);
    });
    return Response.json({ explainBack: session.explainBack, reflection: session.reflection });
  } catch (error) {
    return apiError(error);
  }
}
