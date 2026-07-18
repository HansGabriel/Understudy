import { z } from "zod";

export const challengeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  projectId: z.string().regex(/^[a-z0-9-]+$/).default("task-manager"),
  drafted: z.boolean().default(false),
  draftedBy: z.enum(["ai", "learner"]).optional(),
  mode: z.literal("replay"),
  title: z.string(),
  baseCommit: z.string().min(7),
  referenceCommit: z.string().min(7),
  difficulty: z.number().int().min(1).max(5),
  estimatedTime: z.string(),
  testCommand: z.string(),
  hiddenTestCommand: z.string(),
  hiddenTestFile: z.string(),
  hiddenTestFiles: z.array(z.object({ source: z.string().min(1), relativePath: z.string().min(1) })).default([]),
  behavioralCheck: z.enum(["hidden", "full-suite"]).default("hidden"),
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
    hiddenTestFiles: true,
    behavioralCheck: true,
    hints: true,
    planQuestions: true,
    explainBackQuestion: true,
  })
  .extend({
    tag: z.string(),
    behavioralCheck: z.enum(["hidden", "full-suite"]).default("hidden"),
  });

export const coachingSourceSchema = z.enum(["ai", "authored"]);
export const projectDetectionSchema = z.object({ packageManager: z.literal("npm"), testCommand: z.literal("test") });
export const projectSummarySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  mode: z.enum(["built-in", "linked"]),
  path: z.string().optional(),
  detected: projectDetectionSchema,
  consent: z.boolean().default(false),
});
export const projectCommitSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{7,40}$/i),
  subject: z.string(),
  date: z.string().datetime(),
  filesChanged: z.array(z.string()),
  addsTests: z.boolean(),
  replayable: z.boolean(),
  badge: z.string(),
  validationStatus: z.enum(["replayable", "not-replayable", "pending", "unverified"]).default("not-replayable"),
});
export const projectCommitValidationSchema = z.object({
  sha: z.string().regex(/^[0-9a-f]{7,40}$/i),
  status: z.enum(["replayable", "not-replayable", "unverified"]),
  checkedAt: z.string().datetime(),
  error: z.string().max(1000).optional(),
});
export const challengeDraftSchema = z.object({
  title: z.string().trim().min(1).max(180),
  difficulty: z.number().int().min(1).max(5),
  estimatedTime: z.string().trim().min(1).max(80),
  learningObjectives: z.array(z.string().trim().min(1).max(160)).min(1).max(6),
  brief: z.object({
    desiredBehavior: z.string().trim().min(1).max(1200),
    acceptanceCriteria: z.array(z.string().trim().min(1).max(400)).min(1).max(6),
    constraints: z.array(z.string().trim().min(1).max(400)).min(1).max(6),
  }),
  planQuestions: z.array(z.string().trim().min(1).max(400)).length(3),
  hints: z.array(z.object({ level: z.number().int().min(1).max(3), text: z.string().trim().min(1).max(500) })).length(3),
  explainBackQuestion: z.string().trim().min(1).max(500),
});
export const variationProposalSchema = challengeDraftSchema.extend({
  sourcePath: z.literal("src/task-manager.ts"),
  referenceSource: z.string().min(1).max(120_000),
  behavioralTest: z.string().min(1).max(80_000),
});
export const coachingResultSchema = z.object({
  text: z.string().min(1),
  source: coachingSourceSchema,
  rejected: z.boolean().optional(),
});

export const coachThreadMessageSchema = z.object({
  role: z.enum(["learner", "coach"]),
  text: z.string().min(1).max(900),
  at: z.string().datetime(),
  source: coachingSourceSchema.optional(),
});

export const timelineEventSchema = z.object({
  type: z.enum([
    "plan_submitted",
    "attempt",
    "signal_failure",
    "hint",
    "all_passed",
    "explained",
    "coach",
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
  projectId: z.string().regex(/^[a-z0-9-]+$/).default("task-manager"),
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
  coachThread: z.array(coachThreadMessageSchema).default([]),
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
export const projectIdSchema = z.string().regex(/^[a-z0-9-]+$/);
export const projectCommitInputSchema = z.object({ sha: z.string().regex(/^[0-9a-f]{7,40}$/i) });
export const planInputSchema = z.object({ answers: z.array(z.string().trim().min(3).max(800)).length(3) });
export const hintInputSchema = z.object({ level: z.number().int().min(1).max(3) });
export const explainInputSchema = z.object({ answer: z.string().trim().min(3).max(1600) });
export const coachInputSchema = z.object({ message: z.string().trim().min(3).max(600) });
export const projectPathInputSchema = z.object({ path: z.string().trim().min(1).max(4096), consent: z.boolean().default(false) });
export const variationInputSchema = z.object({ challengeId: z.string().regex(/^[a-z0-9-]+$/) });

export type Challenge = z.infer<typeof challengeSchema>;
export type PublicChallenge = z.infer<typeof publicChallengeSchema>;
export type SessionRecord = z.infer<typeof sessionSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
export type DiffDetails = z.infer<typeof diffDetailsSchema>;
export type ReferenceDiff = z.infer<typeof referenceDiffSchema>;
export type SampleSessionFixture = z.infer<typeof sampleSessionFixtureSchema>;
export type CoachingSource = z.infer<typeof coachingSourceSchema>;
export type CoachingResult = z.infer<typeof coachingResultSchema>;
export type CoachThreadMessage = z.infer<typeof coachThreadMessageSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectCommit = z.infer<typeof projectCommitSchema>;
export type ProjectCommitValidation = z.infer<typeof projectCommitValidationSchema>;
export type ChallengeDraft = z.infer<typeof challengeDraftSchema>;
export type VariationProposal = z.infer<typeof variationProposalSchema>;
