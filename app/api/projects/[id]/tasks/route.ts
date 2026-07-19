import { apiError, parseJson } from "@/lib/api";
import { listKataTasks, regenerateKataTask } from "@/lib/project-replays";
import { projectIdSchema, projectKataBoardInputSchema, projectKataRegenerateInputSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, context: RouteContext<"/api/projects/[id]/tasks">) {
  try {
    const { id } = await context.params;
    const projectId = projectIdSchema.parse(id);
    const guidance = projectKataBoardInputSchema.parse({ guidance: new URL(request.url).searchParams.get("guidance") ?? undefined }).guidance;
    return Response.json(await listKataTasks(projectId, guidance));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext<"/api/projects/[id]/tasks">) {
  try {
    const { id } = await context.params;
    const projectId = projectIdSchema.parse(id);
    const { sha, guidance } = projectKataRegenerateInputSchema.parse(await parseJson(request));
    return Response.json(await regenerateKataTask(projectId, sha, guidance));
  } catch (error) {
    return apiError(error);
  }
}
