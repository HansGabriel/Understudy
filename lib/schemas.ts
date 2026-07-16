import { z } from "zod";

export const challengeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  mode: z.literal("replay"),
  title: z.string(),
  baseCommit: z.string().min(7),
  referenceCommit: z.string().min(7),
  difficulty: z.number().int().min(1).max(5),
  estimatedTime: z.string(),
  testCommand: z.string(),
  hiddenTestCommand: z.string(),
  hiddenTestFile: z.string(),
  learningObjectives: z.array(z.string()).min(1),
  brief: z.object({
    desiredBehavior: z.string(),
    acceptanceCriteria: z.array(z.string()).min(1),
    constraints: z.array(z.string()).min(1),
  }),
  planQuestions: z.array(z.string()).length(3),
  hints: z
    .array(z.object({ level: z.number().int().min(1).max(3), text: z.string() }))
    .length(3),
  explainBackQuestion: z.string(),
});

export const publicChallengeSchema = challengeSchema
  .omit({
    baseCommit: true,
    referenceCommit: true,
    testCommand: true,
    hiddenTestCommand: true,
    hiddenTestFile: true,
    hints: true,
    planQuestions: true,
    explainBackQuestion: true,
  })
  .extend({
    tag: z.string(),
  });

export const coachingSourceSchema = z.enum(["ai", "authored"]);
export const coachingResultSchema = z.object({
  text: z.string().min(1),
  source: coachingSourceSchema,
});

export const timelineEventSchema = z.object({
  type: z.enum([
    "plan_submitted",
    "attempt",
    "signal_failure",
    "hint",
    "all_passed",
    "explained",
  ]),
  at: z.string().datetime(),
  meta: z.record(z.string(), z.unknown()),
  source: coachingSourceSchema.optional(),
});

export const checkResultSchema = z.object({
  passed: z.boolean(),
  output: z.string(),
  exitCode: z.number(),
  total: z.number().int().nonnegative().optional(),
  failures: z.array(z.string()).optional(),
});

export const diffDetailsSchema = z.object({
  patch: z.string(),
  files: z.array(z.string()),
});

export const diffSummarySchema = z.object({
  stat: z.string(),
  shortstat: z.string(),
  addedLines: z.array(z.string()).default([]),
});

export const referenceDiffSchema = diffDetailsSchema.extend({
  commit: z.string().min(7),
});

export const sessionSchema = z.object({
  id: z.string().uuid(),
  challengeId: z.string(),
  createdAt: z.string().datetime(),
  worktreePath: z.string(),
  status: z.enum(["planning", "coding", "passed", "completed"]),
  plan: z.object({
    answers: z.array(z.string()).length(3),
    aiFeedback: z.string(),
    aiSource: coachingSourceSchema.optional(),
    revisionCount: z.number().int().min(0).max(1).default(0),
    confirmed: z.boolean().default(false),
  }),
  attempts: z.array(
    z.object({
      at: z.string().datetime(),
      normalSuite: checkResultSchema,
      behavioral: checkResultSchema,
    }),
  ),
  hints: z.array(z.object({ level: z.number().int().min(1).max(3), at: z.string().datetime(), text: z.string(), aiSource: coachingSourceSchema.optional() })),
  explainBack: z.object({ question: z.string(), answer: z.string(), aiFeedback: z.string(), aiSource: coachingSourceSchema.optional() }),
  reflection: z.string(),
  reflectionSource: coachingSourceSchema.optional(),
  lastCoaching: coachingResultSchema.nullable().optional(),
  timeline: z.array(timelineEventSchema),
});

export const sampleSessionFixtureSchema = z.object({
  session: sessionSchema,
  diff: diffSummarySchema,
  learnerDiff: diffDetailsSchema,
  referenceDiff: referenceDiffSchema,
});

export const createSessionInputSchema = z.object({ challengeId: z.string().regex(/^[a-z0-9-]+$/) });
export const sessionIdSchema = z.string().uuid();
export const planInputSchema = z.object({ answers: z.array(z.string().trim().min(3).max(800)).length(3) });
export const hintInputSchema = z.object({ level: z.number().int().min(1).max(3) });
export const explainInputSchema = z.object({ answer: z.string().trim().min(3).max(1600) });

export type Challenge = z.infer<typeof challengeSchema>;
export type PublicChallenge = z.infer<typeof publicChallengeSchema>;
export type SessionRecord = z.infer<typeof sessionSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
export type DiffDetails = z.infer<typeof diffDetailsSchema>;
export type ReferenceDiff = z.infer<typeof referenceDiffSchema>;
export type SampleSessionFixture = z.infer<typeof sampleSessionFixtureSchema>;
export type CoachingSource = z.infer<typeof coachingSourceSchema>;
export type CoachingResult = z.infer<typeof coachingResultSchema>;
