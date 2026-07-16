import { apiError, parseJson } from "@/lib/api";
import { listProjects, registerLinkedProject } from "@/lib/projects";
import { projectPathInputSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listProjects());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { path, consent } = projectPathInputSchema.parse(await parseJson(request));
    const project = await registerLinkedProject(path, consent);
    return Response.json(project, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
