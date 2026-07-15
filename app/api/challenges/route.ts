import { listPublicChallenges } from "@/lib/challenges";
import { apiError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listPublicChallenges());
  } catch (error) {
    return apiError(error);
  }
}
