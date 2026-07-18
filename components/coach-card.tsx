import { CoachingSourceChip } from "@/components/coaching-source";
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
  const used = session.coachThread.filter((entry) => entry.role === "learner").length;
  const capped = used >= 12;
  const available = coachAvailable ?? true;
  return (
    <aside className="card coach-card">
      <div className="report-topline"><span>Coach / deliberate support</span><span>coach messages: {used} of 12</span></div>
      <h2>Guides your thinking.</h2>
      <p className="coach-contract">Never writes your patch. Every message is part of your report.</p>
      <div className="coach-thread" aria-live="polite">
        {session.coachThread.length ? session.coachThread.map((entry, index) => (
          <div className={`coach-message ${entry.role}`} key={`${entry.at}-${index}`}>
            <div className="coach-message-label">{entry.role === "learner" ? "You" : "Coach"}{entry.source ? <CoachingSourceChip source={entry.source} /> : null}</div>
            <p>{entry.text}</p>
          </div>
        )) : <p className="coach-empty">Ask about the behavior, a failing check, or what evidence to look for. Source code is never sent to the coach.</p>}
      </div>
      {!available ? <p className="coach-unavailable">Add <code>OPENAI_API_KEY</code> to enable live GPT-5.6 coaching. Hints remain available and this does not use your coach-message allowance.</p> : null}
      <textarea value={value} maxLength={600} disabled={!available || busy || capped} onChange={(event) => onChange(event.target.value)} placeholder={!available ? "Live coach unavailable" : capped ? "Message limit reached" : "What are you unsure about?"} aria-label="Message the coach" />
      <div className="coach-actions"><button className="button secondary small" disabled={!available || busy || capped || value.trim().length < 3} onClick={onSend}>{busy ? "Thinking..." : capped ? "12 messages used" : "Ask the coach ->"}</button><span>{value.length}/600</span></div>
    </aside>
  );
}
