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
});

export const checkResultSchema = z.object({
  passed: z.boolean(),
  output: z.string(),
  exitCode: z.number(),
  total: z.number().int().nonnegative().optional(),
  failures: z.array(z.string()).optional(),
});

export const sessionSchema = z.object({
  id: z.string().uuid(),
  challengeId: z.string(),
  createdAt: z.string().datetime(),
  worktreePath: z.string(),
  status: z.enum(["planning", "coding", "passed", "completed"]),
  plan: z.object({ answers: z.array(z.string()).length(3), aiFeedback: z.string() }),
  attempts: z.array(
    z.object({
      at: z.string().datetime(),
      normalSuite: checkResultSchema,
      behavioral: checkResultSchema,
    }),
  ),
  hints: z.array(z.object({ level: z.number().int().min(1).max(3), at: z.string().datetime(), text: z.string() })),
  explainBack: z.object({ question: z.string(), answer: z.string(), aiFeedback: z.string() }),
  reflection: z.string(),
  timeline: z.array(timelineEventSchema),
});

export const createSessionInputSchema = z.object({ challengeId: z.string().regex(/^[a-z0-9-]+$/) });
export const planInputSchema = z.object({ answers: z.array(z.string().trim().min(3).max(800)).length(3) });
export const hintInputSchema = z.object({ level: z.number().int().min(1).max(3) });
export const explainInputSchema = z.object({ answer: z.string().trim().min(3).max(1600) });

export type Challenge = z.infer<typeof challengeSchema>;
export type PublicChallenge = z.infer<typeof publicChallengeSchema>;
export type SessionRecord = z.infer<typeof sessionSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;
