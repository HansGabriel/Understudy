import { apiError } from "@/lib/api";
import { projectIdSchema } from "@/lib/schemas";
import { listProjectCommits } from "@/lib/project-replays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/projects/[id]/commits">) {
  try {
    const { id } = await context.params;
    return Response.json(await listProjectCommits(projectIdSchema.parse(id)));
  } catch (error) {
    return apiError(error);
  }
}
