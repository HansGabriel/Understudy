import { apiError, parseJson } from "@/lib/api";
import { getChallenge, toPublicChallenge } from "@/lib/challenges";
import { variationInputSchema } from "@/lib/schemas";
import { generateAndPublishVariation } from "@/lib/variations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    const { challengeId } = variationInputSchema.parse(await parseJson(request));
    const baseChallenge = await getChallenge(challengeId);
    const challenge = await generateAndPublishVariation(baseChallenge);
    return Response.json({ challenge: toPublicChallenge(challenge), published: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
