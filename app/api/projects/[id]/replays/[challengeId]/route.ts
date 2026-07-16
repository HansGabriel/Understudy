import { apiError, parseJson } from "@/lib/api";
import { challengeDraftView, updateLinkedChallengeDraft } from "@/lib/project-replays";
import { challengeDraftSchema, projectIdSchema } from "@/lib/schemas";
import { toPublicChallenge } from "@/lib/challenges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/projects/[id]/replays/[challengeId]">) {
  try {
    const { id, challengeId } = await context.params;
    const projectId = projectIdSchema.parse(id);
    const draft = challengeDraftSchema.parse(await parseJson(request));
    const challenge = await updateLinkedChallengeDraft(projectId, challengeId, draft);
    return Response.json({ challenge: toPublicChallenge(challenge), draft: challengeDraftView(challenge) });
  } catch (error) {
    return apiError(error);
  }
}
