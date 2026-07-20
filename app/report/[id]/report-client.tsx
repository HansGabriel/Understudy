"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CoachingSourceChip } from "@/components/coaching-source";
import { SessionTimeline } from "@/components/session-timeline";
import { buildReportSummary } from "@/lib/report-summary";
import type { DiffDetails, PublicChallenge, ReferenceDiff, SessionRecord } from "@/lib/schemas";

type ReportPayload = {
  session: SessionRecord;
  challenge: PublicChallenge;
  recommendedChallenge: PublicChallenge | null;
  diff: { stat: string; shortstat: string; addedLines?: string[] };
  referenceDiff?: ReferenceDiff;
  learnerDiff?: DiffDetails;
};

function DiffViewer({ patch, emptyLabel }: { patch: string; emptyLabel: string }) {
  const lines = patch ? patch.split(/\r?\n/) : [emptyLabel];
  return (
    <pre className="diff-output">
      {lines.map((line, index) => {
        const added = line.startsWith("+") && !line.startsWith("+++");
        const removed = line.startsWith("-") && !line.startsWith("---");
        const hunk = line.startsWith("@@");
        const tone = added ? "diff-add" : removed ? "diff-remove" : hunk ? "diff-hunk" : "";
        return <span className={`diff-line ${tone}`} key={`${index}-${line}`}>{line || " "}</span>;
      })}
    </pre>
  );
}

export default function ReportClient({ sessionId, sample = false }: { sessionId: string; sample?: boolean }) {
  const router = useRouter();
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<ReportPayload> => {
    const response = await fetch(sample ? "/api/sample-session" : `/api/sessions/${sessionId}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load report.");
    return data;
  }, [sample, sessionId]);

  useEffect(() => {
    let cancelled = false;
    void load().then((data) => { if (!cancelled) setPayload(data); }).catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [load]);

  const session = payload?.session;
  const attempt = session?.attempts.at(-1);
  const allPassed = Boolean(attempt?.normalSuite.passed && attempt?.behavioral.passed);
  const hasReferenceReveal = session?.status === "completed" && payload?.referenceDiff && payload.learnerDiff;
  const narrative = session && payload ? buildReportSummary({
    attempts: session.attempts,
    hints: session.hints,
    coachThread: session.coachThread,
    outline: session.outline,
    plan: session.plan,
    desiredBehavior: payload.challenge.brief.desiredBehavior,
  }) : null;

  async function practiceAgain() {
    if (!payload || busy) return;
    if (!window.confirm("Discard this report and start a fresh replay for the same challenge?")) return;
    setBusy(true); setError("");
    try {
      const deleteResponse = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      const deleteData = await deleteResponse.json();
      if (!deleteResponse.ok) throw new Error(deleteData.error ?? "Could not discard this session.");
      const createResponse = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: payload.session.challengeId }) });
      const createData = await createResponse.json();
      if (!createResponse.ok) throw new Error(createData.error ?? "Could not start a fresh replay.");
      router.push(`/session/${createData.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start a fresh replay.");
    } finally { setBusy(false); }
  }

  async function deleteSession() {
    if (sample || !payload || busy) return;
    if (!window.confirm("Delete this saved session and its working copy? This cannot be undone.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not delete this session.");
      router.push("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this session.");
    } finally { setBusy(false); }
  }

  return (
    <AppShell active="report">
      {error ? <p className="notice error-notice">{error}</p> : null}
      {!payload ? <section className="page-content"><div className="card plan-card"><p className="eyebrow">Loading learning evidence</p><h2>Building your mastery report...</h2></div></section> : <section className="page-content">
        <div className="report-topline"><span>REPLAY / session #{session!.id.slice(0, 5)}</span><span>attempts {session!.attempts.length} / hints {session!.hints.length} of 3</span></div>
        <header className="page-head"><div><h1>Mastery Report</h1><p>{payload.challenge.title} — evidence from this replay, not a certification.</p></div><div className="report-header-meta"><span className={`difficulty-chip difficulty-${payload.challenge.difficulty}`} aria-label={`${payload.challenge.difficulty} out of 5 difficulty`}>{"●".repeat(payload.challenge.difficulty)}<span>{"●".repeat(5 - payload.challenge.difficulty)}</span></span>{sample ? <span className="sample-badge">Sample session / read-only</span> : null}</div></header>
        {narrative ? <section className={`card report-summary ${allPassed ? "passed" : "in-progress"}`}>
          <p className="eyebrow">Session story / evidence from this replay</p>
          <p><strong>{narrative.verdict}</strong></p>
          <p>{[narrative.signal, narrative.support, narrative.closing].filter(Boolean).join(" ")}</p>
        </section> : null}
        <div className="signal-panels">
          <section className="card signal-panel"><p className="eyebrow">Engineering outcome</p><h2>{allPassed ? "Passed" : "In progress"}</h2><p>{allPassed ? "all required checks green" : "complete the required checks"}</p><div className="metric-row"><span>project&apos;s own tests <small>normal suite</small></span><strong>{attempt?.normalSuite.passed ? "passed" : "not passed"}</strong></div><div className="metric-row"><span>edge-case check <small>behavioral test</small></span><strong>{attempt?.behavioral.passed ? "passed" : "not passed"}</strong></div><div className="metric-row"><span>regressions</span><strong>{attempt?.normalSuite.passed ? "none" : "review needed"}</strong></div></section>
          <section className="card signal-panel guided"><p className="eyebrow">Independence</p><h2>{session!.hints.length || session!.coachThread.some((entry) => entry.role === "learner") || session!.outline ? "Guided" : "Independent"}</h2><p>{session!.hints.length ? `${session!.hints.length} hint${session!.hints.length === 1 ? "" : "s"} used as context, not a penalty` : session!.coachThread.some((entry) => entry.role === "learner") ? "Coach support used as context, not a penalty" : session!.outline ? "An approach outline was used as context, not a penalty" : "No hints or coach messages were needed"}</p>{[1, 2, 3].map((level) => <div className="metric-row" key={level}><span>L{level} / {level === 1 ? "concept nudge" : level === 2 ? "guiding question" : "location pointer"}</span><strong>{session!.hints.some((hint) => hint.level === level) ? "used" : "not needed"}</strong></div>)}<div className="metric-row"><span>approach outline</span><strong>{session!.outline ? "used" : "not used"}</strong></div><div className="metric-row"><span>coach messages</span><strong>{session!.coachThread.filter((entry) => entry.role === "learner").length}</strong></div></section>
        </div>
        <SessionTimeline session={session!} />
        <div className="report-grid">
          <section className="card diff-box"><p className="eyebrow">Diff summary</p><strong>{payload.diff.shortstat || "No tracked changes"}</strong><pre>{payload.diff.stat || "Your worktree diff will appear after you edit the fixture."}</pre><p className="diff-excerpt-label">Learner additions</p><pre className="diff-excerpt">{payload.diff.addedLines?.length ? payload.diff.addedLines.join("\n") : "No added lines captured yet."}</pre></section>
          <div><section className="card response-box"><p className="eyebrow">Your plan / submitted before coding</p><p>{session!.plan.answers.map((answer, index) => `${index + 1}. ${answer}`).join("\n\n")}</p></section><section className="card response-box" style={{ marginTop: 18 }}><p className="eyebrow">Explain-back</p><h2>{session!.explainBack.question}</h2><p>{session!.explainBack.answer || "Complete the explain-back after all checks pass."}</p></section></div>
        </div>
        {hasReferenceReveal ? <section className="card reference-reveal">
          <div className="reference-reveal-head">
            <div><p className="eyebrow">How it actually landed</p><h2>Compare the reference with your work</h2><p>Different shape, same behavior is fine. The tests decide.</p></div>
            <span className="reference-reveal-note">Unlocked after explain-back</span>
          </div>
          <div className="diff-columns">
            <article className="diff-pane">
              <div className="diff-pane-head"><strong>Reference implementation</strong><span title={payload.referenceDiff!.commit}>commit {payload.referenceDiff!.commit}</span></div>
              <p className="diff-files">Changed files: {payload.referenceDiff!.files.length ? payload.referenceDiff!.files.join(" / ") : "none"}</p>
              <DiffViewer patch={payload.referenceDiff!.patch} emptyLabel="Reference commit has no tracked patch." />
            </article>
            <article className="diff-pane">
              <div className="diff-pane-head"><strong>Your learner diff</strong><span>{payload.learnerDiff!.files.length} file{payload.learnerDiff!.files.length === 1 ? "" : "s"}</span></div>
              <p className="diff-files">Changed files: {payload.learnerDiff!.files.length ? payload.learnerDiff!.files.join(" / ") : "none"}</p>
              <DiffViewer patch={payload.learnerDiff!.patch} emptyLabel="No learner patch was captured." />
            </article>
          </div>
        </section> : null}
        <section className="reflection"><p className="eyebrow">AI reflection / grounded in timeline + test output <CoachingSourceChip source={session!.reflectionSource} /></p>{session!.reflectionBullets?.length ? <ul>{session!.reflectionBullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : <p>{session!.reflection || "Complete the explain-back to generate an evidence-grounded reflection. Without an API key, Understudy supplies authored coaching instead."}</p>}</section>
        <section className="card response-box" style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18 }}><div><p className="eyebrow">{payload.recommendedChallenge ? "Recommended next" : "Library status"}</p><h2>{payload.recommendedChallenge ? payload.recommendedChallenge.title : "You've completed the library"}</h2><p>{payload.recommendedChallenge ? payload.recommendedChallenge.brief.desiredBehavior : "Both curated replays are complete. You can revisit a challenge or return to the library."}</p></div><div className="action-row report-actions">{sample ? null : <><button className="button quiet" onClick={deleteSession} disabled={busy}>Delete this session</button><button className="button secondary" onClick={practiceAgain} disabled={busy}>{busy ? "Preparing..." : "Practice again"}</button></>}<Link className="button" href="/">{sample ? "Open library" : payload.recommendedChallenge ? "Replay next ->" : "Back to library"}</Link></div></section>
      </section>}
    </AppShell>
  );
}
