import { apiError, parseJson } from "@/lib/api";
import { getChallenge, toPublicChallenge } from "@/lib/challenges";
import { variationGuidanceInputSchema } from "@/lib/schemas";
import { generateAndPublishVariation } from "@/lib/variations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const { challengeId, guidance } = variationGuidanceInputSchema.parse(await parseJson(request));
    const baseChallenge = await getChallenge(challengeId);
    const challenge = await generateAndPublishVariation(baseChallenge, guidance);
    return Response.json({ challenge: toPublicChallenge(challenge), published: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
