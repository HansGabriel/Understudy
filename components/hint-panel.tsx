import { CoachingSourceChip } from "@/components/coaching-source";
import type { SessionRecord } from "@/lib/schemas";

const labels = ["Concept nudge", "Guiding question", "Location & pseudocode"];

export function HintPanel({ session, onReveal, busy }: { session: SessionRecord; onReveal: (level: number) => void; busy: boolean }) {
  return (
    <aside className="card hint-panel">
      <div className="report-topline"><span>Hints / a rationed resource</span><span>{session.hints.length} of 3 used</span></div>
      <h2>Take the next step, not the answer</h2>
      <p>Every reveal is deliberate and logged in your mastery report. Tests, not the coach, decide whether the work is correct.</p>
      {[1, 2, 3].map((level) => {
        const hint = session.hints.find((item) => item.level === level);
        const available = level === session.hints.length + 1;
        return (
          <div className={`hint-level ${hint ? "open" : ""}`} key={level}>
            <h3><span className="hint-number">{level}</span>{labels[level - 1]}</h3>
            {hint ? <p>{hint.text} <CoachingSourceChip source={hint.aiSource} /></p> : <p>{level === 1 ? "Start with the core behavior before reaching for a fix." : level === 2 ? "A sharper question about the mechanism - still no code." : "Names a location and concept, never a working solution."}</p>}
            {!hint && <button className="button secondary small" disabled={!available || busy} onClick={() => onReveal(level)}>{available ? `Reveal level ${level}` : "Sealed until previous hint"}</button>}
          </div>
        );
      })}
    </aside>
  );
}
