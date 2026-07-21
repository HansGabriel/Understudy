"use client";

import { useEffect, useRef } from "react";
import { CoachingSourceChip } from "@/components/coaching-source";
import { isSubmitShortcut, MIN_INPUT_LENGTH } from "@/lib/input";
import type { SessionRecord } from "@/lib/schemas";

type CoachCardProps = {
  session: SessionRecord;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  busy: boolean;
  available?: boolean;
};

export function CoachCard({ session, value, onChange, onSend, busy, available: coachAvailable }: CoachCardProps) {
  const threadRef = useRef<HTMLDivElement>(null);
  const used = session.coachThread.filter((entry) => entry.role === "learner").length;
  const capped = used >= 12;
  const available = coachAvailable ?? true;
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [session.coachThread.length]);
  return (
    <aside className="card coach-card">
      <div className="report-topline"><span>Coach / deliberate support</span><span>coach messages: {used} of 12</span></div>
      <h2>Guides your thinking.</h2>
      <p className="coach-contract">Never writes your patch. Every message is part of your report.</p>
      <div className="coach-thread" ref={threadRef} aria-live="polite">
        {session.coachThread.length ? session.coachThread.map((entry, index) => (
          <div className={`coach-message ${entry.role}`} key={`${entry.at}-${index}`}>
            <div className="coach-message-label">{entry.role === "learner" ? "You" : "Coach"}{entry.source ? <CoachingSourceChip source={entry.source} /> : null}</div>
            <p>{entry.text}</p>
          </div>
        )) : <p className="coach-empty">Ask about the behavior, a failing check, or what evidence to look for. Source code is never sent to the coach.</p>}
      </div>
      {!available ? <p className="coach-unavailable">Add <code>OPENAI_API_KEY</code> to enable live GPT-5.6 coaching. Hints remain available and this does not use your coach-message allowance.</p> : null}
      <textarea value={value} maxLength={600} disabled={!available || busy || capped} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (isSubmitShortcut(event)) { event.preventDefault(); if (available && !busy && !capped && value.trim().length >= MIN_INPUT_LENGTH) onSend(); } }} placeholder={!available ? "Live coach unavailable" : capped ? "Message limit reached" : "What are you unsure about?"} aria-label="Message the coach" aria-describedby={available && !capped && value.length > 0 && value.trim().length < MIN_INPUT_LENGTH ? "coach-validation-hint" : undefined} aria-invalid={available && !capped && value.length > 0 && value.trim().length < MIN_INPUT_LENGTH} />
      <div className="coach-actions"><button className="button secondary small" disabled={!available || busy || capped || value.trim().length < MIN_INPUT_LENGTH} onClick={onSend}>{busy ? "Thinking..." : capped ? "12 messages used" : "Ask the coach ->"}</button><span>{value.length}/600</span></div>
      {available && !capped && value.length > 0 && value.trim().length < MIN_INPUT_LENGTH ? <p id="coach-validation-hint" className="field-hint" role="status" aria-live="polite">Each message needs at least {MIN_INPUT_LENGTH} characters.</p> : null}
    </aside>
  );
}
