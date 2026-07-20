import { describe, expect, it } from "vitest";
import { buildReportSummary, truncateReportSummary } from "@/lib/report-summary";

const passedAttempt = {
  at: "2026-07-20T09:00:00.000Z",
  normalSuite: { passed: true, output: "", exitCode: 0 },
  behavioral: { passed: true, output: "", exitCode: 0 },
};

function summaryInput() {
  return {
    attempts: [],
    hints: [],
    coachThread: [],
    outline: undefined,
    plan: { revisionCount: 0 },
    desiredBehavior: "Restore the task state when the save request rejects.",
  };
}

describe("report narrative summary", () => {
  it("describes a first-try pass without inventing an amber signal", () => {
    const summary = buildReportSummary({ ...summaryInput(), attempts: [passedAttempt] });

    expect(summary).toMatchObject({
      verdict: "Passed after 1 attempt.",
      support: "You worked without hints, coach messages, or an approach outline.",
      closing: expect.stringContaining("the tests decided, not the AI"),
    });
    expect(summary.signal).toBeUndefined();
  });

  it("tells the fixture-shaped fail-then-pass story and records support", () => {
    const summary = buildReportSummary({
      ...summaryInput(),
      attempts: [
        { ...passedAttempt, behavioral: { passed: false, output: "", exitCode: 1 } },
        passedAttempt,
      ],
      hints: [{ level: 1, at: "2026-07-20T09:01:00.000Z", text: "Preserve the prior state." }],
      coachThread: [{ role: "learner", text: "Where should the previous state live?", at: "2026-07-20T09:02:00.000Z" }],
      outline: { steps: ["Inspect", "Change", "Verify"], at: "2026-07-20T09:03:00.000Z", source: "authored" },
      plan: { revisionCount: 1 },
    });

    expect(summary.verdict).toBe("Passed after 2 attempts.");
    expect(summary.signal).toContain("kept the project's own tests green");
    expect(summary.support).toBe("Support used: 1 hint (up to L1), 1 coach message, an approach outline, and one plan revision.");
    expect(summary.closing).toBeDefined();
  });

  it("reports an unfinished session and a normal-suite regression accurately", () => {
    const summary = buildReportSummary({
      ...summaryInput(),
      attempts: [{ ...passedAttempt, normalSuite: { passed: false, output: "", exitCode: 1 }, behavioral: { passed: false, output: "", exitCode: 1 } }],
    });

    expect(summary.verdict).toBe("In progress — 1 attempt so far.");
    expect(summary.signal).toBe("Your first attempt broke the project's own tests before the edge-case check came into play.");
    expect(summary.closing).toBeUndefined();
  });

  it("truncates desired behavior at a word boundary", () => {
    const text = "Restore the previous task state after a rejected persistence request while retaining a clear error for the learner and keeping every normal behavior intact across refreshes.";
    const truncated = truncateReportSummary(text, 80);

    expect(truncated).toBe("Restore the previous task state after a rejected persistence request while…");
    expect(truncated.length).toBeLessThanOrEqual(80);
  });
});
