import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { approachOutlineSchema, challengeDraftSchema, planFeedbackDetailSchema, variationProposalSchema, type ApproachOutline, type Challenge, type ChallengeDraft, type CoachThreadMessage, type CoachingResult, type HintContent, type PlanFeedbackDetail, type SessionRecord, type VariationProposal } from "@/lib/schemas";

const coachResponseSchema = z.object({ feedback: z.string().min(1).max(1_600) });
// Responses API structured outputs require every field to be present. Keep these
// transport schemas separate from the app schemas, where the same fields are
// naturally optional, then normalize nulls at the boundary below.
const aiHintContentSchema = z.object({
  concept: z.string().trim().min(1).max(700).nullable(),
  lookAt: z.string().trim().min(1).max(700).nullable(),
  testIdea: z.string().trim().min(1).max(700).nullable(),
});
const hintResponseSchema = aiHintContentSchema.extend({ concept: z.string().trim().min(1).max(700) });
const aiBriefSchema = z.object({
  story: z.string().trim().min(1).max(1200).nullable(),
  desiredBehavior: z.string().trim().min(1).max(1200),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(400)).min(1).max(6),
  constraints: z.array(z.string().trim().min(1).max(400)).min(1).max(6),
  example: z.string().trim().min(1).max(900).nullable(),
});
const aiChallengeDraftSchema = z.object({
  title: z.string().trim().min(1).max(180),
  difficulty: z.number().int().min(1).max(5),
  estimatedTime: z.string().trim().min(1).max(80),
  learningObjectives: z.array(z.string().trim().min(1).max(160)).min(1).max(6),
  brief: aiBriefSchema,
  planQuestions: z.array(z.string().trim().min(1).max(400)).length(3),
  hints: z.array(z.object({ level: z.number().int().min(1).max(3), text: z.string().trim().min(1).max(700), ...aiHintContentSchema.shape })).length(3),
  explainBackQuestion: z.string().trim().min(1).max(500),
});
const aiVariationProposalSchema = aiChallengeDraftSchema.extend({
  sourcePath: z.literal("src/task-manager.ts"),
  referenceSource: z.string().min(1).max(120_000),
  behavioralTest: z.string().min(1).max(80_000),
});
const failureResponseSchema = z.object({ expectedVsObserved: z.string().trim().min(1).max(850), investigationQuestion: z.string().trim().min(1).max(500) });
const reflectionResponseSchema = z.object({ observations: z.array(z.string().trim().min(1).max(500)).length(3) });

export const aiStructuredOutputSchemas = [
  { name: "coach_response", schema: coachResponseSchema },
  { name: "plan_feedback", schema: planFeedbackDetailSchema },
  { name: "structured_hint", schema: hintResponseSchema },
  { name: "failure_coaching", schema: failureResponseSchema },
  { name: "report_reflection", schema: reflectionResponseSchema },
  { name: "approach_outline", schema: approachOutlineSchema },
  { name: "challenge_draft", schema: aiChallengeDraftSchema },
  { name: "variation_proposal", schema: aiVariationProposalSchema },
] as const;

export type CommitDraftContext = {
  subject: string;
  body: string;
  stat: string;
  guidance?: string;
};

export type VariationContext = {
  challenge: Challenge;
  referenceSource: string;
  guidance?: string;
};

const coachSystem = [
  "You are Understudy's coding coach.",
  "Deterministic test results are authoritative.",
  "Before a session is completed, never receive or reveal the reference implementation, exact patch, or a full solution sequence.",
  "Never write the learner's code.",
  "Concepts and questions are always allowed. Pseudocode requires hint level 2 or two failed verify attempts. Partial solution shapes require hint level 3. Unrestricted discussion is only allowed after completion.",
  "Be specific and useful at the current tier. Vague encouragement is a failure mode. Keep deterministic tests authoritative and never write the learner's patch.",
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

function isSafeCoachingText(value: string, maximum = 1_600) {
  return value.length <= maximum && !/```|`|=>|\b(?:const|let|var|function|await|try|catch|return)\b|\w+\s*\(|\.\w+\s*\(/i.test(value);
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

function normalizeHintContent(value: z.infer<typeof aiHintContentSchema>): HintContent {
  return {
    ...(value.concept ? { concept: value.concept } : {}),
    ...(value.lookAt ? { lookAt: value.lookAt } : {}),
    ...(value.testIdea ? { testIdea: value.testIdea } : {}),
  };
}

function nullableHintContent(value: HintContent): z.infer<typeof aiHintContentSchema> {
  return { concept: value.concept ?? null, lookAt: value.lookAt ?? null, testIdea: value.testIdea ?? null };
}

function normalizeChallengeDraft(value: z.infer<typeof aiChallengeDraftSchema>): ChallengeDraft {
  return challengeDraftSchema.parse({
    ...value,
    brief: {
      desiredBehavior: value.brief.desiredBehavior,
      acceptanceCriteria: value.brief.acceptanceCriteria,
      constraints: value.brief.constraints,
      ...(value.brief.story ? { story: value.brief.story } : {}),
      ...(value.brief.example ? { example: value.brief.example } : {}),
    },
    hints: value.hints.map((hint) => ({ level: hint.level, text: hint.text, ...normalizeHintContent(hint) })),
  });
}

function normalizeVariationProposal(value: z.infer<typeof aiVariationProposalSchema>): VariationProposal {
  return variationProposalSchema.parse({ ...normalizeChallengeDraft(value), sourcePath: value.sourcePath, referenceSource: value.referenceSource, behavioralTest: value.behavioralTest });
}

export function coachEscalation(context: CoachContext): CoachEscalation {
  if (context.status === "completed") return "unrestricted";
  if (context.revealedHints.some((hint) => hint.level >= 3)) return "partial";
  if (context.revealedHints.some((hint) => hint.level >= 2) || context.failedVerifyAttempts >= 2) return "pseudocode";
  return "concept";
}

export function acceptsCoachFeedback(feedback: string, context: CoachContext) {
  const text = feedback.trim();
  if (!text || text.length > 1_600) return false;
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

async function structuredCoach<T>(prompt: string, schema: z.ZodType<T>, fallback: T, accept: (value: T) => boolean, name: string): Promise<{ value: T; source: CoachingResult["source"] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { value: fallback, source: "authored" };
  try {
    const client = new OpenAI({ apiKey, timeout: 8_000, maxRetries: 0 });
    const response = await client.responses.parse({
      model: "gpt-5.6",
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: coachSystem },
        { role: "user", content: prompt },
      ],
      text: { format: zodTextFormat(schema, name) },
    });
    const parsed = response.output_parsed;
    if (parsed && accept(parsed)) return { value: parsed, source: "ai" };
  } catch {
    // The authored response is intentionally usable when the live call fails.
  }
  return { value: fallback, source: "authored" };
}

function planFallback(answers: string[]): PlanFeedbackDetail {
  const rows = answers.map((answer, index) => ({
    answer: index + 1,
    assessment: answer.trim().length < 18
      ? "Name one observable result instead of a broad intention."
      : "This gives the investigation a useful starting point; keep it tied to observable behavior.",
  })) as PlanFeedbackDetail["rows"];
  return {
    rows,
    sharpeningQuestion: "What exact result should change, and what exact result must remain true when the edge case happens?",
  };
}

function planText(feedback: PlanFeedbackDetail) {
  return `${feedback.rows.map((row) => `${row.answer}. ${row.assessment}`).join("\n")}\n\n${feedback.sharpeningQuestion}`;
}

export async function detailedPlanFeedback(answers: string[], challenge: Challenge): Promise<CoachingResult & { feedback: PlanFeedbackDetail }> {
  const combined = answers.join(" ");
  const vague = answers.some((answer) => answer.trim().length < 18) || !/\b(?:fail|reject|error|restore|rollback|invalid|fallback|preserve)\b/i.test(combined);
  const fallback = planFallback(answers);
  if (vague) {
    fallback.rows = fallback.rows.map((row) => ({ ...row, assessment: "Name one concrete observable behavior or failure case the tests can prove." })) as PlanFeedbackDetail["rows"];
  }
  const result = await structuredCoach(
    `Challenge brief: ${challenge.brief.desiredBehavior}\nLearner plan:\n${answers.map((answer, index) => `${index + 1}. ${answer}`).join("\n")}\nReturn exactly three per-answer assessments and one sharpening question. Each assessment must name one concrete strength or gap in that answer. Be specific to behavior and evidence, but give no code, identifiers, file paths, or implementation order. Tests, not the coach, decide correctness.`,
    planFeedbackDetailSchema,
    fallback,
    (value) => value.rows.every((row) => isSafeCoachingText(row.assessment, 420)) && isSafeCoachingText(value.sharpeningQuestion, 500) && value.sharpeningQuestion.includes("?"),
    "plan_feedback",
  );
  return { text: planText(result.value), source: result.source, feedback: result.value };
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

function fallbackHint(level: number, challenge: Challenge): HintContent {
  const authored = challenge.hints.find((hint) => hint.level === level)?.text ?? "Re-run the checks and inspect the observed behavior.";
  if (level === 1) return { concept: authored };
  if (level === 2) return { concept: authored, lookAt: "Trace the state or contract that connects the observed behavior to the edge case." };
  return { concept: authored, lookAt: "Inspect the smallest task-manager area responsible for the stated behavior.", testIdea: "Run the edge-case check again after making the smallest behavior-focused change." };
}

function renderHint(content: HintContent) {
  return [content.concept, content.lookAt && `Look at: ${content.lookAt}`, content.testIdea && `Test idea: ${content.testIdea}`].filter(Boolean).join("\n\n");
}

export async function structuredHint(level: number, challenge: Challenge, lastFailureOutput: string | undefined): Promise<CoachingResult & { hint: HintContent }> {
  const fallback = fallbackHint(level, challenge);
  const result = await structuredCoach(
    `Challenge: ${challenge.brief.desiredBehavior}\nRequested hint level: ${level}\nAuthored hint: ${fallback.concept}\nLatest test output: ${lastFailureOutput ?? "none"}\nReturn a structured hint. L1: concept only. L2: concept plus a broad area to inspect, never a file or line. L3: add one test idea and you may name a file-level area but never code or an implementation sequence.`,
    hintResponseSchema,
    nullableHintContent(fallback) as z.infer<typeof hintResponseSchema>,
    (value) => {
      const hint = normalizeHintContent(value);
      const hasFilePointer = (text: string) => /(?:^|\s)[\w.-]+\.[cm]?[jt]sx?(?=\s|$)/i.test(text);
      const hasPathPointer = (text: string) => /(?:^|\s)(?:[\w.-]+[\\/])+[\w.-]+\.[cm]?[jt]sx?(?=\s|$)/i.test(text);
      return Boolean(hint.concept)
        && (level >= 2 || (!hint.lookAt && !hint.testIdea))
        && (level >= 3 || !hint.testIdea)
        && Object.values(hint).filter(Boolean).every((text) => isSafeCoachingText(text!, 700) && !hasPathPointer(text!) && (level >= 3 || !hasFilePointer(text!)));
    },
    "structured_hint",
  );
  const hint = normalizeHintContent(result.value);
  return { text: renderHint(hint), source: result.source, hint };
}

export async function detailedFailureCoaching(testOutput: string, challenge: Challenge): Promise<CoachingResult> {
  const fallback = {
    expectedVsObserved: "Expected the edge-case behavior in the brief while keeping the familiar path intact. The normal suite passed, but the edge-case check observed a gap in that behavior.",
    investigationQuestion: "What state or result differs between the expected edge case and the behavior the check observed?",
  };
  const result = await structuredCoach(
    `Desired behavior: ${challenge.brief.desiredBehavior}\nThe behavioral check observed:\n${testOutput}\nState expected versus observed behavior concretely, then ask exactly one investigation question. Do not prescribe a fix, name identifiers, paths, or code.`,
    failureResponseSchema,
    fallback,
    (value) => isSafeCoachingText(value.expectedVsObserved, 850) && isSafeCoachingText(value.investigationQuestion, 500) && value.investigationQuestion.includes("?"),
    "failure_coaching",
  );
  return { text: `Expected vs observed: ${result.value.expectedVsObserved}\n\nQuestion: ${result.value.investigationQuestion}`, source: result.source };
}

export async function structuredReflection(session: SessionRecord): Promise<CoachingResult & { bullets: string[] }> {
  const fallback = [
    `The first check attempt created evidence for the next investigation.`,
    `${session.hints.length ? `${session.hints.length} hint${session.hints.length === 1 ? " was" : "s were"} used as context` : "No hints were needed"}; the report keeps support visible without treating it as a penalty.`,
    `The completed explanation closes a loop of ${session.attempts.length} check attempt${session.attempts.length === 1 ? "" : "s"}.`,
  ];
  const result = await structuredCoach(
    `Session evidence only:\nAttempts: ${session.attempts.length}\nHints used: ${session.hints.map((hint) => hint.level).join(", ") || "none"}\nCoach messages: ${session.coachThread.filter((entry) => entry.role === "learner").length}\nOutline used: ${Boolean(session.outline)}\nExplanation completed: ${Boolean(session.explainBack.answer)}\nReturn exactly three short observations: what early evidence showed, what closed the loop, and one evidence-tied practice focus. Do not repeat learner code or give implementation instructions.`,
    reflectionResponseSchema,
    { observations: fallback },
    (value) => value.observations.every((observation) => isSafeCoachingText(observation, 500)),
    "report_reflection",
  );
  return { text: result.value.observations.map((item) => `• ${item}`).join("\n"), source: result.source, bullets: result.value.observations };
}

export async function approachOutline(challenge: Challenge, answers: string[]): Promise<CoachingResult & { outline: ApproachOutline }> {
  const fallback: ApproachOutline = { steps: [
    "Name the observable behavior and edge case in your own words.",
    "Read the existing tests to understand the current contract.",
    "Make the smallest behavior-focused change in your working copy.",
    "Use the normal suite and edge-case check as evidence.",
  ] };
  const result = await structuredCoach(
    `Challenge: ${challenge.brief.desiredBehavior}\nLearner plan:\n${answers.map((answer, index) => `${index + 1}. ${contextSafeText(answer)}`).join("\n")}\nGive a 3-5 step high-level approach outline. No code, identifiers, paths, or solution sequence. Stay at concept level and point back to tests as evidence.`,
    approachOutlineSchema,
    fallback,
    (value) => value.steps.every((step) => isSafeCoachingText(step, 420)),
    "approach_outline",
  );
  return { text: result.value.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"), source: result.source, outline: result.value };
}

export async function draftChallengeFromCommit(context: CommitDraftContext): Promise<ChallengeDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const prompt = [
    "Draft an educational replay challenge from this git commit metadata.",
    "Use only the commit subject, commit message body, and diff stat below. Never infer or request the source patch.",
    "The learner will start at the parent commit and use deterministic tests; write a concise, headless data-layer kata brief. Include a plain-language story and a short before/after behavior example, never source code.",
    `Commit subject:\n${context.subject.slice(0, 500)}`,
    `Commit body:\n${context.body.slice(0, 3000) || "(none)"}`,
    `Diff stat:\n${context.stat.slice(0, 3000) || "(none)"}`,
    context.guidance ? `Learner practice interest: ${context.guidance.slice(0, 600)}` : "",
    "Return exactly three plan questions and exactly three structured hints with levels 1, 2, and 3. Hints use concept, then lookAt, then testIdea progressively. Do not include code, file names, line numbers, or a solution sequence.",
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
      text: { format: zodTextFormat(aiChallengeDraftSchema, "challenge_draft") },
    });
    const parsed = response.output_parsed;
    if (!parsed) return null;
    const draft = normalizeChallengeDraft(parsed);
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
    context.guidance ? `Learner practice interest: ${context.guidance.slice(0, 600)}` : "",
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
      text: { format: zodTextFormat(aiVariationProposalSchema, "variation_proposal") },
    });
    const proposal = response.output_parsed;
    if (!proposal) return null;
    const parsed = normalizeVariationProposal(proposal);
    if (/process\.|child_process|fs\.|exec\(|spawn\(|```/i.test(`${parsed.referenceSource}\n${parsed.behavioralTest}`)) return null;
    return parsed;
  } catch {
    return null;
  }
}
