import { coachMessage, coachEscalation } from "@/lib/ai";
import { apiError, parseJson } from "@/lib/api";
import { getChallenge } from "@/lib/challenges";
import { referenceDiff } from "@/lib/git";
import { coachInputSchema, sessionIdSchema } from "@/lib/schemas";
import { appendTimeline, updateSession } from "@/lib/sessions";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/sessions/[id]/coach">) {
  try {
    const { id } = await context.params;
    const sessionId = sessionIdSchema.parse(id);
    const { message } = coachInputSchema.parse(await parseJson(request));
    let coachingResult: Awaited<ReturnType<typeof coachMessage>> | null = null;
    const session = await updateSession(sessionId, async (current) => {
      if (current.status === "planning" || (current.status !== "completed" && !current.plan.confirmed)) {
        throw new Error("Confirm your plan before using the coach.");
      }
      const learnerMessages = current.coachThread.filter((entry) => entry.role === "learner").length;
      if (learnerMessages >= 12) throw new Error("The coach message limit of 12 has been reached.");
      const challenge = await getChallenge(current.challengeId);
      const latestAttempt = current.attempts.at(-1);
      const latestAttemptSummary = latestAttempt
        ? [
            `normal suite ${latestAttempt.normalSuite.passed ? "passed" : "failed"}`,
            `edge-case check ${latestAttempt.behavioral.passed ? "passed" : "failed"}`,
            latestAttempt.normalSuite.failures?.join("\n") ?? "",
            latestAttempt.behavioral.failures?.join("\n") ?? "",
          ].filter(Boolean).join("\n")
        : undefined;
      const reference = current.status === "completed"
         ? await referenceDiff(challenge.baseCommit, challenge.referenceCommit, current.projectId).catch(() => undefined)
        : undefined;
      const coachContext = {
        challenge,
        planAnswers: current.plan.answers,
        revealedHints: current.hints.map((hint) => ({ level: hint.level, text: hint.text })),
        failedVerifyAttempts: current.attempts.filter((attempt) => !attempt.normalSuite.passed || !attempt.behavioral.passed).length,
        latestAttemptSummary,
        status: current.status,
        thread: current.coachThread,
        ...(reference ? { referenceDiff: reference.patch } : {}),
      } as const;
      const coaching = await coachMessage(message, coachContext);
      coachingResult = coaching;
      if (coaching.rejected) {
        current.lastCoaching = coaching;
        return current;
      }
      const at = new Date().toISOString();
      current.coachThread.push({ role: "learner", text: message, at });
      current.coachThread.push({ role: "coach", text: coaching.text, at: new Date().toISOString(), source: coaching.source });
      return appendTimeline(current, "coach", { messageCount: learnerMessages + 1, escalation: coachEscalation(coachContext) }, coaching.source);
    });
    const used = session.coachThread.filter((entry) => entry.role === "learner").length;
    return Response.json({ coaching: coachingResult ?? session.coachThread.at(-1), coachThread: session.coachThread, used, remaining: 12 - used });
  } catch (error) {
    return apiError(error);
  }
}
