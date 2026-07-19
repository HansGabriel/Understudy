import { CoachingSourceChip } from "@/components/coaching-source";
import type { SessionRecord } from "@/lib/schemas";

const labels = ["Concept nudge", "Guiding question", "Location & pseudocode"];

export function HintPanel({ session, onReveal, busy }: { session: SessionRecord; onReveal: (level: number) => void; busy: boolean }) {
  return (
    <aside className="card hint-panel">
      <div className="report-topline"><span>Hints</span><span>{session.hints.length} of 3 used</span></div>
      <h2>Take the next step, not the answer</h2>
      <p>Each reveal is logged. Tests decide correctness.</p>
      {[1, 2, 3].map((level) => {
        const hint = session.hints.find((item) => item.level === level);
        const available = level === session.hints.length + 1;
        return (
          <div className={`hint-level ${hint ? "open" : ""}`} key={level}>
            <h3><span className="hint-number">{level}</span>{labels[level - 1]}</h3>
            {hint ? <div className="hint-content"><p><strong>Concept</strong>{hint.concept ?? hint.text}</p>{hint.lookAt ? <p><strong>Look at</strong>{hint.lookAt}</p> : null}{hint.testIdea ? <p><strong>Test idea</strong>{hint.testIdea}</p> : null}<CoachingSourceChip source={hint.aiSource} /></div> : <p>{level === 1 ? "Start with the core behavior." : level === 2 ? "Add a sharper investigation question." : "Connect the behavior to a test."}</p>}
            {!hint && <button className="button secondary small" disabled={!available || busy} onClick={() => onReveal(level)}>{available ? `Reveal level ${level}` : "Sealed until previous hint"}</button>}
          </div>
        );
      })}
    </aside>
  );
}
