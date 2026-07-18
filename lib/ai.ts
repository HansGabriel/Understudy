import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { challengeDraftSchema, variationProposalSchema, type Challenge, type ChallengeDraft, type CoachThreadMessage, type CoachingResult, type SessionRecord, type VariationProposal } from "@/lib/schemas";

const coachResponseSchema = z.object({ feedback: z.string().min(1).max(900) });

export type CommitDraftContext = {
  subject: string;
  body: string;
  stat: string;
};

export type VariationContext = {
  challenge: Challenge;
  referenceSource: string;
};

const coachSystem = [
  "You are Understudy's coding coach.",
  "Deterministic test results are authoritative.",
  "Before a session is completed, never receive or reveal the reference implementation, exact patch, or a full solution sequence.",
  "Never write the learner's code.",
  "Concepts and questions are always allowed. Pseudocode requires hint level 2 or two failed verify attempts. Partial solution shapes require hint level 3. Unrestricted discussion is only allowed after completion.",
  "Keep feedback concise, Socratic, specific to supplied evidence, and supportive.",
].join(" ");

export type CoachEscalation = "concept" | "pseudocode" | "partial" | "unrestricted";

export type CoachContext = {
  challenge: Challenge;
  planAnswers: string[];
  revealedHints: Array<{ level: number; text: string }>;
  failedVerifyAttempts: number;
  latestAttemptSummary?: string;
  status: SessionRecord["status"];
  thread: CoachThreadMessage[];
  referenceDiff?: string;
};

function isSafeCoachingText(value: string) {
  return value.length <= 700 && !/```|`|=>|\b(?:const|let|var|function|await|try|catch|return)\b|\w+\s*\(|\.\w+\s*\(/i.test(value);
}

function containsCodeLikeText(value: string) {
  if (/```/.test(value)) return true;
  if (/(?:^|\s)(?:[\w.-]+[\\/])+[^\s:]+:\d+(?:\s|$)/m.test(value)) return true;
  if (containsFullFunctionBody(value)) return true;
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const codeLines = lines.filter((line) =>
    /^(?:const|let|var|function|class|import|export|return|await)\b/.test(line)
      || /=>/.test(line)
      || /^(?:[\w$.[\]"']+)\s*=\s*[^?].*(?:;|\))$/.test(line)
      || /^(?:if|for|while|switch)\s*\([^)]*\)\s*\{?/.test(line),
  );
  return codeLines.length >= 2;
}

function containsFullFunctionBody(value: string) {
  return /\b(?:function|class)\s+[\w$]+[\s\S]{0,80}\{[\s\S]{0,500}\}/i.test(value) || /=>\s*\{[\s\S]{0,500}\}/.test(value);
}

function containsSolutionSyntax(value: string) {
  return /\b(?:const|let|var|return|import|export)\b|=>/i.test(value);
}

function codeFenceLineCount(value: string) {
  return [...value.matchAll(/```[^\n]*\n?([\s\S]*?)```/g)].reduce((count, match) => count + (match[1]?.split(/\r?\n/).filter(Boolean).length ?? 0), 0);
}

function codeShapeLineCount(value: string) {
  return value.split(/\r?\n/).filter((line) => /^(?:\s*)(?:const|let|var|function|class|import|export|return|await)\b|=>|^\s*[\w$.[\]"']+\s*=/.test(line)).length;
}

function contextSafeText(value: string, limit = 900) {
  return containsCodeLikeText(value) ? "[code omitted from coach context]" : value.slice(0, limit);
}

export function redactCoachContext(value: string) {
  return contextSafeText(value);
}

function contextSafeThread(thread: CoachThreadMessage[]) {
  return thread.map((message) => ({ role: message.role, text: contextSafeText(message.text), source: message.source }));
}

export function coachEscalation(context: CoachContext): CoachEscalation {
  if (context.status === "completed") return "unrestricted";
  if (context.revealedHints.some((hint) => hint.level >= 3)) return "partial";
  if (context.revealedHints.some((hint) => hint.level >= 2) || context.failedVerifyAttempts >= 2) return "pseudocode";
  return "concept";
}

export function acceptsCoachFeedback(feedback: string, context: CoachContext) {
  const text = feedback.trim();
  if (!text || text.length > 900) return false;
  const escalation = coachEscalation(context);
  if (escalation === "unrestricted") return true;
  if (/\b(?:reference implementation|reference diff|full patch|solution patch)\b/i.test(text)) return false;
  if (/(?:^|\s)(?:[\w.-]+[\\/])+[^\s:]+:\d+(?:\s|$)/m.test(text) || containsFullFunctionBody(text)) return false;
  const fencedLines = codeFenceLineCount(text);
  if (escalation === "concept" && (containsCodeLikeText(text) || containsSolutionSyntax(text))) return false;
  if (escalation === "pseudocode" && containsSolutionSyntax(text)) return false;
  if (escalation === "pseudocode" && fencedLines > 5) return false;
  if (escalation === "partial" && (fencedLines > 5 || codeShapeLineCount(text) > 8)) return false;
  return true;
}

async function coach(prompt: string, fallback: string, accept: (feedback: string) => boolean = isSafeCoachingText, rejectedFallback = fallback): Promise<CoachingResult> {
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
    if (!feedback) return { text: fallback, source: "authored" };
    if (accept(feedback)) return { text: feedback, source: "ai" };
    return { text: rejectedFallback, source: "authored", rejected: true };
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

export function coachMessage(message: string, context: CoachContext) {
  const escalation = coachEscalation(context);
  const fallback = "The coach needs an OPENAI_API_KEY. The hint ladder still works fully.";
  const rejectedFallback = "Let’s stay at the idea level: re-read what the failing check observed, then ask what evidence would distinguish the expected behavior from the current one. The tests decide whether the change works.";
  const referenceContext = context.status === "completed" && context.referenceDiff
    ? `\nReference diff (allowed only after completion):\n${context.referenceDiff.slice(0, 12_000)}`
    : "";
  const prompt = [
    `Challenge brief: ${context.challenge.brief.desiredBehavior}`,
    `Learner plan:\n${context.planAnswers.map((answer, index) => `${index + 1}. ${contextSafeText(answer)}`).join("\n")}`,
    `Revealed hints: ${context.revealedHints.map((hint) => `L${hint.level}: ${contextSafeText(hint.text)}`).join(" | ") || "none"}`,
    `Failed verify attempts: ${context.failedVerifyAttempts}`,
    `Latest test-output summary: ${contextSafeText(context.latestAttemptSummary ?? "none")}`,
    `Session status: ${context.status}`,
    `Escalation currently allowed: ${escalation}`,
    `Coach thread so far:\n${contextSafeThread(context.thread).map((entry) => `${entry.role}: ${entry.text}`).join("\n") || "none"}`,
    `Learner message: ${contextSafeText(message, 600)}`,
    referenceContext,
    "Always allowed: concepts, questions back, and restating what a failing check observed.",
    "Pseudocode is allowed only at pseudocode, partial, or unrestricted escalation.",
    "A partial solution shape is allowed only at partial or unrestricted escalation, and must stay short.",
    "Only unrestricted completion may discuss the reference diff. Before completion, never provide a full function, patch, file-and-line prescription, or learner code.",
    "Reply with a concise teacher-like response. Do not claim that the plan or implementation is correct; deterministic tests are the authority.",
  ].filter(Boolean).join("\n\n");
  return coach(
    prompt,
    fallback,
    (feedback) => acceptsCoachFeedback(feedback, context),
    rejectedFallback,
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

export async function draftChallengeFromCommit(context: CommitDraftContext): Promise<ChallengeDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const prompt = [
    "Draft an educational replay challenge from this git commit metadata.",
    "Use only the commit subject, commit message body, and diff stat below. Never infer or request the source patch.",
    "The learner will start at the parent commit and use deterministic tests; write a concise, headless data-layer brief.",
    `Commit subject:\n${context.subject.slice(0, 500)}`,
    `Commit body:\n${context.body.slice(0, 3000) || "(none)"}`,
    `Diff stat:\n${context.stat.slice(0, 3000) || "(none)"}`,
    "Return exactly three plan questions and exactly three hints with levels 1, 2, and 3. Do not include code, file names, line numbers, or a solution sequence.",
  ].join("\n\n");
  try {
    const client = new OpenAI({ apiKey, timeout: 8_000, maxRetries: 0 });
    const response = await client.responses.parse({
      model: "gpt-5.6",
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: "You are an expert curriculum designer for Understudy. Keep the task solvable and behavior-focused. Never output source code or a patch." },
        { role: "user", content: prompt },
      ],
      text: { format: zodTextFormat(challengeDraftSchema, "challenge_draft") },
    });
    const parsed = response.output_parsed;
    if (!parsed) return null;
    const draft = challengeDraftSchema.parse(parsed);
    if (/```|=>|\b(?:const|let|var|function|class|import|export|return|await)\b|(?:^|\s)[\w./-]+:\d+(?:\s|$)/i.test(JSON.stringify(draft))) return null;
    return draft;
  } catch {
    return null;
  }
}

export async function draftVariation(context: VariationContext): Promise<VariationProposal | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const prompt = [
    "Propose exactly one validated Forge-lite variation of this existing task-manager replay.",
    "The variation must be a meaningfully different but small behavior change that can be implemented in src/task-manager.ts.",
    "Return a complete reference source file and a focused Vitest behavioral test. The test must fail against the supplied base source and pass against your reference source.",
    "Do not mention this internal generation process in learner-facing copy. Do not use network, filesystem, or shell APIs in generated code.",
    `Existing challenge title: ${context.challenge.title}`,
    `Existing brief: ${context.challenge.brief.desiredBehavior}`,
    `Existing acceptance criteria: ${context.challenge.brief.acceptanceCriteria.join(" | ")}`,
    `Base/reference source (server-side context only):\n${context.referenceSource.slice(0, 80_000)}`,
  ].join("\n\n");
  try {
    const client = new OpenAI({ apiKey, timeout: 8_000, maxRetries: 0 });
    const response = await client.responses.parse({
      model: "gpt-5.6",
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: "You design small, testable TypeScript learning variations. Return only the requested structured fields. The source and test must be self-contained and safe." },
        { role: "user", content: prompt },
      ],
      text: { format: zodTextFormat(variationProposalSchema, "variation_proposal") },
    });
    const proposal = response.output_parsed;
    if (!proposal) return null;
    const parsed = variationProposalSchema.parse(proposal);
    if (/process\.|child_process|fs\.|exec\(|spawn\(|```/i.test(`${parsed.referenceSource}\n${parsed.behavioralTest}`)) return null;
    return parsed;
  } catch {
    return null;
  }
}
