import { failureCoaching } from "@/lib/ai";
import { apiError } from "@/lib/api";
import { getChallenge } from "@/lib/challenges";
import { runHiddenTest, runHiddenTestFiles, runScript } from "@/lib/test-runner";
import { diffDetails } from "@/lib/git";
import { appendTimeline, updateSession } from "@/lib/sessions";
import type { CoachingResult } from "@/lib/schemas";
import path from "node:path";
import { challengesRoot } from "@/lib/paths";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/sessions/[id]/verify">) {
  try {
    const { id } = await context.params;
    let coaching: CoachingResult | null = null;
    const session = await updateSession(id, async (session) => {
      if (session.status === "planning") throw new Error("Submit your plan before running checks.");
      const challenge = await getChallenge(session.challengeId);
      const normalSuite = await runScript(session.worktreePath, challenge.testCommand);
      const behavioral = challenge.behavioralCheck === "full-suite"
        ? (await diffDetails(session.worktreePath)).files.length > 0
          ? normalSuite
          : { ...normalSuite, passed: false, exitCode: normalSuite.exitCode === 0 ? 1 : normalSuite.exitCode, output: `${normalSuite.output}\n\nNo learner changes detected. Make a change in the working copy before running a full-suite replay.`, failures: ["No learner changes detected"] }
        : challenge.hiddenTestFiles.length
          ? await runHiddenTestFiles(session.worktreePath, challenge.hiddenTestFiles, challenge.hiddenTestCommand)
          : await runHiddenTest(session.worktreePath, path.join(challengesRoot, "tests", `${challenge.id}.challenge.test.ts`));
      session.attempts.push({ at: new Date().toISOString(), normalSuite, behavioral });
      appendTimeline(session, "attempt", { normalPassed: normalSuite.passed, behavioralPassed: behavioral.passed });
      if (normalSuite.passed && !behavioral.passed) {
        coaching = await failureCoaching(behavioral.output, challenge);
        session.lastCoaching = coaching;
        appendTimeline(session, "signal_failure", { assertion: behavioral.failures?.[0] ?? "Behavioral edge case failed" }, coaching.source);
      } else {
        session.lastCoaching = null;
      }
      if (normalSuite.passed && behavioral.passed) {
        session.status = "passed";
        appendTimeline(session, "all_passed", { attempts: session.attempts.length });
      } else {
        session.status = "coding";
      }
      return session;
    });
    return Response.json({ session, coaching });
  } catch (error) {
    return apiError(error);
  }
}
