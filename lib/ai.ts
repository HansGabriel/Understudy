import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Challenge, CoachingResult, SessionRecord } from "@/lib/schemas";

const coachResponseSchema = z.object({ feedback: z.string().min(1).max(900) });

const coachSystem = [
  "You are Understudy's coding coach.",
  "Deterministic test results are authoritative.",
  "Never reveal the reference implementation, exact patch, or a full solution sequence.",
  "Never write the learner's code.",
  "Keep feedback concise, Socratic, specific to supplied evidence, and supportive.",
].join(" ");

function isSafeCoachingText(value: string) {
  return value.length <= 700 && !/```|`|=>|\b(?:const|let|var|function|await|try|catch|return)\b|\w+\s*\(|\.\w+\s*\(/i.test(value);
}

async function coach(prompt: string, fallback: string, accept: (feedback: string) => boolean = isSafeCoachingText): Promise<CoachingResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { text: fallback, source: "authored" };
  try {
    const client = new OpenAI({ apiKey, timeout: 8_000, maxRetries: 0 });
    const response = await client.responses.parse({
      model: "gpt-5.6",
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: coachSystem },
        { role: "user", content: prompt },
      ],
      text: { format: zodTextFormat(coachResponseSchema, "coach_response") },
    });
    const feedback = response.output_parsed?.feedback?.trim();
    return feedback && accept(feedback) ? { text: feedback, source: "ai" } : { text: fallback, source: "authored" };
  } catch {
    return { text: fallback, source: "authored" };
  }
}

export function planFeedback(answers: string[], challenge: Challenge) {
  const normalizedAnswers = answers.map((answer) => answer.trim());
  const combinedAnswers = normalizedAnswers.join(" ");
  const vagueAnswer = normalizedAnswers.some((answer) => answer.length < 18 || /^(?:i have no idea|idk|not sure|maybe|the task details|n\/a)$/i.test(answer));
  const namesBehavior = /\b(?:immediate|before|after|state|task|completion|complete|filter|storage|persist|preference|value)\b/i.test(combinedAnswers);
  const namesFailure = /\b(?:fail|reject|error|invalid|restore|rollback|revert|fallback|preserve|missing)\b/i.test(combinedAnswers);
  const fallback = vagueAnswer || !namesBehavior || !namesFailure
    ? "Plan check: needs revision — your answers are a useful start, but they do not yet name a concrete observable behavior and failure case that the tests can prove. This is not a grading verdict; make those two details explicit before you open the working copy. What exact result should change, and what exact result must remain true when the edge case happens?"
    : "Plan check: aligned with the brief — you named a behavior, an investigation path, and an edge case. This is a reasonable starting hypothesis, not a correctness verdict; the project's tests decide whether the implementation works. Which test result would prove your plan is wrong?";
  return coach(
    `Challenge brief: ${challenge.brief.desiredBehavior}\nLearner plan:\n1. ${answers[0]}\n2. ${answers[1]}\n3. ${answers[2]}\nReturn a short plan check that starts exactly with "Plan check: aligned" or "Plan check: needs revision". Name one concrete strength or missing detail, say that tests—not the coach—decide correctness, and end with one Socratic question. Do not give instructions, name code identifiers, describe an ordering of implementation steps, or include code syntax.`,
    fallback,
    (feedback) => isSafeCoachingText(feedback) && /^Plan check:\s*(?:aligned|needs revision)\b/i.test(feedback.trim()) && feedback.includes("?"),
  );
}

export function hintText(level: number, challenge: Challenge, lastFailureOutput: string | undefined) {
  const authored = challenge.hints.find((hint) => hint.level === level)?.text ?? "Re-run the checks and inspect the observed behavior.";
  return coach(
    `Challenge: ${challenge.brief.desiredBehavior}\nRequested hint level: ${level}\nAuthored hint: ${authored}\nLatest test output: ${lastFailureOutput ?? "none"}\nRephrase the authored hint without revealing a solution, implementation order, code identifiers, or syntax. Level 1 is a concept, level 2 is a question, level 3 is only a location/concept pointer.`,
    authored,
    (feedback) => isSafeCoachingText(feedback) && !/\b(?:first|then|next|should|need to|implement|fix)\b/i.test(feedback),
  );
}

export function failureCoaching(testOutput: string, challenge: Challenge) {
  return coach(
    `Desired behavior: ${challenge.brief.desiredBehavior}\nThe behavioral check observed:\n${testOutput}\nExplain what the test observed without prescribing a fix.`,
    "The normal suite confirms the familiar path still works. The behavioral check observed an edge case the first attempt missed; treat that evidence as the next thing to understand, not as a setup failure.",
    (feedback) => isSafeCoachingText(feedback) && !/\b(?:should|need to|fix|change|implement|update|restore|save)\b/i.test(feedback),
  );
}

export function reflection(session: SessionRecord) {
  const fallback = `You logged ${session.attempts.length} check attempt${session.attempts.length === 1 ? "" : "s"} and used ${session.hints.length} of 3 hints. Your report separates a passing engineering outcome from the support you chose to use.`;
  return coach(
    `Session evidence only:\nAttempts: ${session.attempts.length}\nHints used: ${session.hints.map((hint) => hint.level).join(", ") || "none"}\nExplanation completed: ${Boolean(session.explainBack.answer)}\nProvide a short evidence-grounded reflection about process only. Do not repeat the learner answer, give advice, describe behavior changes, or discuss implementation details.`,
    fallback,
    (feedback) => isSafeCoachingText(feedback) && !/\b(?:should|next|update|restore|save|rollback|implement|code|state)\b/i.test(feedback),
  );
}
