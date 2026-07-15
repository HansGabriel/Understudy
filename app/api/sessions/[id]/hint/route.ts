import { hintText } from "@/lib/ai";
import { apiError, parseJson } from "@/lib/api";
import { getChallenge } from "@/lib/challenges";
import { hintInputSchema } from "@/lib/schemas";
import { appendTimeline, updateSession } from "@/lib/sessions";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/hint">) {
  try {
    const { id } = await context.params;
    const { level } = hintInputSchema.parse(await parseJson(request));
    const session = await updateSession(id, async (current) => {
      const nextLevel = current.hints.length + 1;
      if (level !== nextLevel) throw new Error("Hints can only be revealed one level at a time.");
      const challenge = await getChallenge(current.challengeId);
      const lastOutput = current.attempts.at(-1)?.behavioral.output;
      const text = await hintText(level, challenge, lastOutput);
      current.hints.push({ level, at: new Date().toISOString(), text });
      return appendTimeline(current, "hint", { level });
    });
    return Response.json({ hint: session.hints.at(-1), used: session.hints.length });
  } catch (error) {
    return apiError(error);
  }
}
