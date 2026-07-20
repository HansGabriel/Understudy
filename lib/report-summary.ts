import type { SessionRecord } from "@/lib/schemas";

type ReportSummaryInput = Pick<SessionRecord, "attempts" | "hints" | "coachThread" | "outline" | "plan"> & {
  desiredBehavior: string;
};

export type ReportSummary = {
  verdict: string;
  signal?: string;
  support: string;
  closing?: string;
};

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function naturalList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function truncateReportSummary(text: string, maxLength = 140) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;

  const limit = Math.max(1, maxLength - 1);
  const boundary = normalized.lastIndexOf(" ", limit);
  return `${normalized.slice(0, boundary > 0 ? boundary : limit).trimEnd()}…`;
}

export function buildReportSummary({ attempts, hints, coachThread, outline, plan, desiredBehavior }: ReportSummaryInput): ReportSummary {
  const latestAttempt = attempts.at(-1);
  const fullyPassed = Boolean(latestAttempt?.normalSuite.passed && latestAttempt.behavioral.passed);
  const verdict = fullyPassed
    ? `Passed after ${plural(attempts.length, "attempt")}.`
    : attempts.length > 0
      ? `In progress — ${plural(attempts.length, "attempt")} so far.`
      : "No verification runs yet.";

  const firstAttempt = attempts[0];
  let signal: string | undefined;
  if (firstAttempt?.normalSuite.passed && !firstAttempt.behavioral.passed) {
    const desiredBehaviorSentence = truncateReportSummary(desiredBehavior);
    const behavior = desiredBehaviorSentence.endsWith("…")
      ? desiredBehaviorSentence
      : `${desiredBehaviorSentence.replace(/[.?!]+$/, "")}.`;
    signal = `Your first attempt kept the project's own tests green but missed the edge-case check: ${behavior}`;
  } else if (firstAttempt && !firstAttempt.normalSuite.passed) {
    signal = "Your first attempt broke the project's own tests before the edge-case check came into play.";
  }

  const coachCount = coachThread.filter((message) => message.role === "learner").length;
  const highestHint = hints.reduce((highest, hint) => Math.max(highest, hint.level), 0);
  const supportItems = [
    hints.length ? `${plural(hints.length, "hint")} (up to L${highestHint})` : "",
    coachCount ? plural(coachCount, "coach message") : "",
    outline ? "an approach outline" : "",
    plan.revisionCount ? `${plan.revisionCount === 1 ? "one" : plan.revisionCount} plan revision${plan.revisionCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const support = supportItems.length
    ? `Support used: ${naturalList(supportItems)}.`
    : "You worked without hints, coach messages, or an approach outline.";

  return {
    verdict,
    signal,
    support,
    closing: fullyPassed ? "Your final change passed both the normal suite and the edge-case check — the tests decided, not the AI." : undefined,
  };
}
