"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SessionTimeline } from "@/components/session-timeline";
import type { PublicChallenge, SessionRecord } from "@/lib/schemas";

type ReportPayload = { session: SessionRecord; challenge: PublicChallenge; diff: { stat: string; shortstat: string } };

export default function ReportClient({ sessionId }: { sessionId: string }) {
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async (): Promise<ReportPayload> => {
    const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load report.");
    return data;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void load().then((data) => { if (!cancelled) setPayload(data); }).catch((reason: Error) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [load]);

  const session = payload?.session;
  const attempt = session?.attempts.at(-1);
  const allPassed = Boolean(attempt?.normalSuite.passed && attempt?.behavioral.passed);

  return (
    <AppShell active="report">
      {error ? <p className="notice error-notice">{error}</p> : null}
      {!payload ? <section className="page-content"><div className="card plan-card"><p className="eyebrow">Loading learning evidence</p><h2>Building your mastery report…</h2></div></section> : <section className="page-content">
        <div className="report-topline"><span>↻ REPLAY · session #{session!.id.slice(0, 5)}</span><span>attempts {session!.attempts.length} · hints {session!.hints.length} / 3</span></div>
        <header className="page-head"><div><h1>Mastery Report</h1><p>{payload.challenge.title}</p></div></header>
        <div className="signal-panels">
          <section className="card signal-panel"><p className="eyebrow">Engineering outcome</p><h2>{allPassed ? "Passed" : "In progress"}</h2><p>{allPassed ? "all required checks green" : "complete the required checks"}</p><div className="metric-row"><span>normal suite</span><strong>{attempt?.normalSuite.passed ? "✓ passed" : "not passed"}</strong></div><div className="metric-row"><span>behavioral test</span><strong>{attempt?.behavioral.passed ? "✓ passed" : "not passed"}</strong></div><div className="metric-row"><span>regressions</span><strong>{attempt?.normalSuite.passed ? "none" : "review needed"}</strong></div></section>
          <section className="card signal-panel guided"><p className="eyebrow">Independence</p><h2>{session!.hints.length ? "Guided" : "Independent"}</h2><p>{session!.hints.length ? `${session!.hints.length} hint${session!.hints.length === 1 ? "" : "s"} used as context, not a penalty` : "No hints were needed"}</p>{[1, 2, 3].map((level) => <div className="metric-row" key={level}><span>L{level} · {level === 1 ? "concept nudge" : level === 2 ? "guiding question" : "location pointer"}</span><strong>{session!.hints.some((hint) => hint.level === level) ? "used" : "not needed"}</strong></div>)}</section>
        </div>
        <SessionTimeline session={session!} />
        <div className="report-grid">
          <section className="card diff-box"><p className="eyebrow">Diff summary</p><strong>{payload.diff.shortstat || "No tracked changes"}</strong><pre>{payload.diff.stat || "Your worktree diff will appear after you edit the fixture."}</pre></section>
          <div><section className="card response-box"><p className="eyebrow">Your plan — submitted before coding</p><p>{session!.plan.answers.map((answer, index) => `${index + 1}. ${answer}`).join("\n\n")}</p></section><section className="card response-box" style={{ marginTop: 18 }}><p className="eyebrow">Explain-back</p><h2>{session!.explainBack.question}</h2><p>{session!.explainBack.answer || "Complete the explain-back after all checks pass."}</p></section></div>
        </div>
        <section className="reflection"><p className="eyebrow">AI reflection · grounded in timeline + test output</p><p>{session!.reflection || "Complete the explain-back to generate an evidence-grounded reflection. Without an API key, Understudy supplies authored coaching instead."}</p></section>
        <section className="card response-box" style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18 }}><div><p className="eyebrow">Recommended next</p><h2>Persist task-filter preferences</h2><p>Stay in async/state territory, then practice validation on read.</p></div><Link className="button" href="/">Replay next →</Link></section>
      </section>}
    </AppShell>
  );
}
