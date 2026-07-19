"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CoachingSourceChip } from "@/components/coaching-source";
import { CoachCard } from "@/components/coach-card";
import { ApproachOutline } from "@/components/approach-outline";
import { HintPanel } from "@/components/hint-panel";
import { KataBrief } from "@/components/kata-brief";
import { PlanFeedback } from "@/components/plan-feedback";
import { TerminalBlock } from "@/components/terminal-block";
import type { CoachingSource, PublicChallenge, SessionRecord } from "@/lib/schemas";

type SessionPayload = {
  session: SessionRecord;
  challenge: PublicChallenge & { planQuestions: string[] };
  canOpenInVSCode: boolean;
  coachAvailable: boolean;
  diff: { stat: string; shortstat: string };
};

export default function SessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [explainAnswer, setExplainAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeSource, setNoticeSource] = useState<CoachingSource | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editingPlan, setEditingPlan] = useState(false);
  const [coachInput, setCoachInput] = useState("");

  const load = useCallback(async (): Promise<SessionPayload> => {
    const response = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load session.");
    return data;
  }, [sessionId]);

  const refresh = useCallback(async () => {
    const data = await load();
    setPayload(data);
    setAnswers(data.session.plan.answers);
    setExplainAnswer(data.session.explainBack.answer);
    if (data.session.lastCoaching) {
      setNotice(data.session.lastCoaching.text);
      setNoticeSource(data.session.lastCoaching.source);
    }
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void load().then((data) => {
      if (cancelled) return;
      setPayload(data);
      setAnswers(data.session.plan.answers);
      setExplainAnswer(data.session.explainBack.answer);
      if (data.session.lastCoaching) {
        setNotice(data.session.lastCoaching.text);
        setNoticeSource(data.session.lastCoaching.source);
      }
    }).catch((reason: Error) => {
      if (!cancelled) setError(reason.message);
    });
    return () => { cancelled = true; };
  }, [load]);

  const session = payload?.session;
  const latestAttempt = session?.attempts.at(-1);
  const isSignal = Boolean(latestAttempt?.normalSuite.passed && !latestAttempt?.behavioral.passed);
  const isReadyToExplain = session?.status === "passed";

  async function request(path: string, body?: unknown) {
    setError(""); setNotice(""); setNoticeSource(null); setBusy(path);
    try {
      const response = await fetch(`/api/sessions/${sessionId}${path}`, body === undefined ? { method: "POST" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Session action failed.");
      if (data.coaching) {
        setNotice(data.coaching.text);
        setNoticeSource(data.coaching.source);
      }
      await refresh();
      return data;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Session action failed.");
      return undefined;
    } finally { setBusy(""); }
  }

  async function submitPlan() {
    const data = await request("/plan", { answers });
    if (data) setEditingPlan(false);
  }
  async function confirmPlan() { await request("/plan/confirm"); }
  async function requestOutline() { await request("/outline"); }
  async function sendCoachMessage() {
    const message = coachInput.trim();
    if (message.length < 3 || busy) return;
    setError(""); setNotice(""); setNoticeSource(null); setBusy("/coach");
    try {
      const response = await fetch(`/api/sessions/${sessionId}/coach`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Coach request failed.");
      setCoachInput("");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Coach request failed.");
    } finally { setBusy(""); }
  }
  async function verify() { await request("/verify"); }
  async function reveal(level: number) { await request("/hint", { level }); }
  async function completeExplain() {
    const data = await request("/explain", { answer: explainAnswer });
    if (data) router.push(`/report/${sessionId}`);
  }
  async function copyPath() {
    if (!session) return;
    await navigator.clipboard.writeText(session.worktreePath);
    setNoticeSource(null);
    setNotice("Workspace path copied. Open it in your editor and own the implementation.");
  }
  function openVSCode() {
    if (session) window.location.assign(`vscode://file/${encodeURIComponent(session.worktreePath)}`);
  }
  async function discardSession() {
    if (!window.confirm("Discard this replay? Its worktree and session evidence will be deleted.")) return;
    setError(""); setNotice(""); setNoticeSource(null); setBusy("/delete");
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not discard this session.");
      router.push("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not discard this session.");
    } finally { setBusy(""); }
  }

  const normal = latestAttempt?.normalSuite;
  const behavioral = latestAttempt?.behavioral;
  const planSubmitted = Boolean(session?.plan.answers.every(Boolean));
  const planComplete = Boolean(planSubmitted && session?.plan.confirmed);
  const displaySignalCopy = notice || "The project's own tests pass, so the familiar path works. The edge-case check found the behavior that still needs attention; tests are the source of truth here, not the AI.";

  return (
    <AppShell active="session">
      {error ? <p className="notice error-notice">{error}{!payload ? <> <Link href="/" style={{ textDecoration: "underline" }}>Start a new replay</Link> if this working copy was removed.</> : null}</p> : null}
      {notice && !isSignal ? <p className="notice">{notice} {noticeSource ? <CoachingSourceChip source={noticeSource} /> : null}</p> : null}
      {!payload ? <section className="page-content"><div className="card plan-card"><p className="eyebrow">Preparing your working copy <span className="technical-label">git worktree</span></p><h2>Opening your replay session...</h2></div></section> : (
        <section className="page-content">
          {planComplete ? <><div className="card worktree-bar"><div><p className="eyebrow">Your working copy <span className="technical-label">git worktree</span></p><strong className="worktree-path">{session?.worktreePath}</strong></div><div className="action-row"><button className="button secondary small" onClick={copyPath}>Copy path</button>{payload.canOpenInVSCode ? <button className="button secondary small" onClick={openVSCode}>Open in VS Code</button> : null}{!session?.outline ? <button className="button secondary small" onClick={requestOutline} disabled={busy !== ""}>{busy === "/outline" ? "Thinking..." : "Suggest an approach outline"}</button> : null}</div></div>{session?.outline ? <ApproachOutline outline={session.outline} /> : null}</> : null}
          {(!planSubmitted || editingPlan) ? <section className="card plan-card"><p className="eyebrow">{editingPlan ? "Plan revision / one round" : "Replay planning checkpoint"}</p><h2>{editingPlan ? "Refine your plan before opening the working copy." : "Rebuild a real change from this project's history."}</h2><p style={{ color: "var(--muted)", marginTop: -8 }}>{editingPlan ? "You get one revision round. The coach will respond once more, then you can lock the plan." : "Name the behavior before opening your working copy. The coach responds with a short question or nudge - never a patch."}</p>{payload.challenge.planQuestions.map((question, index) => <div className="question" key={question}><label htmlFor={`answer-${index}`}>{index + 1}. {question}</label><textarea id={`answer-${index}`} value={answers[index]} onChange={(event) => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer))} /></div>)}<div className="action-row"><button className="button cobalt" disabled={busy !== "" || answers.some((answer) => answer.trim().length < 3)} onClick={submitPlan}>{busy === "/plan" ? "Coaching..." : editingPlan ? "Submit revision ->" : "Send plan to coach ->"}</button>{editingPlan ? <button className="button secondary" disabled={busy !== ""} onClick={() => setEditingPlan(false)}>Keep current plan</button> : null}</div></section> : null}
          {planSubmitted && !planComplete && !editingPlan ? <section className="card plan-coach-card"><p className="eyebrow">Plan feedback</p><h2>Here&apos;s the coach&apos;s read.</h2><PlanFeedback plan={session!.plan} /><p className="plan-review-copy">A direction check, not a grading verdict. The project&apos;s tests decide whether the implementation works.</p><div className="action-row"><button className="button cobalt" disabled={busy !== ""} onClick={confirmPlan}>{busy === "/plan/confirm" ? "Opening..." : "Use this plan & open working copy"}</button>{(session?.plan.revisionCount ?? 0) < 1 ? <button className="button secondary" disabled={busy !== ""} onClick={() => setEditingPlan(true)}>Revise once</button> : <span className="revision-used">One revision used</span>}</div></section> : null}
          {planComplete ? <div className="session-layout"><div><div className="session-grid"><KataBrief challenge={payload.challenge} status={session!.status} /><section className="card checks-card"><div className="checks-heading"><div><h2>Run checks</h2><p>{payload.challenge.behavioralCheck === "full-suite" ? "The project&apos;s full test suite is the only check for this replay." : "The project&apos;s own tests + one edge-case check, against your working copy."}</p></div><button className="button cobalt" disabled={busy !== ""} onClick={verify}>{busy === "/verify" ? "Running..." : "Run checks"}</button></div><TerminalBlock normal={normal} behavioral={behavioral} behavioralMode={payload.challenge.behavioralCheck} />{isSignal ? <div className="signal-callout"><span className="signal-icon">!</span><div><strong>This is the signal</strong><p>{displaySignalCopy} {noticeSource ? <CoachingSourceChip source={noticeSource} /> : null}</p><div className="action-row" style={{ marginTop: 12 }}><button className="button signal small" onClick={() => reveal(session!.hints.length + 1)} disabled={busy !== "" || session!.hints.length === 3}>Request a hint</button><button className="button secondary small" onClick={verify} disabled={busy !== ""}>Re-run checks</button></div></div></div> : null}</section></div>{isReadyToExplain ? <section className="card explain-card"><p className="eyebrow">Explain-back</p><h2>{session?.explainBack.question}</h2><textarea value={explainAnswer} onChange={(event) => setExplainAnswer(event.target.value)} placeholder="Explain the reasoning in your own words..." /><button className="button cobalt" onClick={completeExplain} disabled={busy !== "" || explainAnswer.trim().length < 3}>{busy === "/explain" ? "Reviewing..." : "Complete explanation ->"}</button></section> : null}</div><div className="session-side"><HintPanel session={session!} onReveal={reveal} busy={busy !== ""} /><CoachCard session={session!} value={coachInput} onChange={setCoachInput} onSend={sendCoachMessage} busy={busy === "/coach"} available={payload.coachAvailable} /></div></div> : null}
          {payload ? <div className="session-footer-actions"><button className="button quiet" onClick={discardSession} disabled={busy !== ""}>{busy === "/delete" ? "Discarding..." : "Discard session"}</button></div> : null}
        </section>
      )}
    </AppShell>
  );
}
