import { apiError } from "@/lib/api";
import { MIN_INPUT_LENGTH } from "@/lib/input";
import { updateSession } from "@/lib/sessions";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/sessions/[id]/plan/confirm">) {
  try {
    const { id } = await context.params;
    const session = await updateSession(id, async (current) => {
      if (current.status !== "coding") throw new Error("Submit your plan before opening the working copy.");
      if (!current.plan.answers.every((answer) => answer.trim().length >= MIN_INPUT_LENGTH)) throw new Error("Complete all planning answers before continuing.");
      current.plan.confirmed = true;
      return current;
    });
    return Response.json(session.plan);
  } catch (error) {
    return apiError(error);
  }
}
