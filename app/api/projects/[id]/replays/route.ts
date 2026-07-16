import { apiError, parseJson } from "@/lib/api";
import { challengeDraftView, createLinkedChallenge } from "@/lib/project-replays";
import { projectCommitInputSchema, projectIdSchema } from "@/lib/schemas";
import { toPublicChallenge } from "@/lib/challenges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/projects/[id]/replays">) {
  try {
    const { id } = await context.params;
    const projectId = projectIdSchema.parse(id);
    const { sha } = projectCommitInputSchema.parse(await parseJson(request));
    const result = await createLinkedChallenge(projectId, sha);
    return Response.json({ challenge: toPublicChallenge(result.challenge), draft: challengeDraftView(result.challenge), source: result.source, commit: { sha: result.commit.sha, subject: result.commit.subject } }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
