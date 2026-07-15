import type { PublicChallenge } from "@/lib/schemas";

export function ChallengeCard({ challenge, busy, onReplay }: { challenge: PublicChallenge; busy: boolean; onReplay: (id: string) => void }) {
  const filled = "●".repeat(challenge.difficulty);
  const empty = "●".repeat(5 - challenge.difficulty);
  return (
    <article className="card challenge-card">
      <div>
        <span className="replay-tag">REPLAY</span>
        <span className="chip" style={{ marginLeft: 8 }}>{challenge.tag}</span>
        <h2>{challenge.title}</h2>
        <p>{challenge.brief.desiredBehavior}</p>
        <div className="chip-row">{challenge.learningObjectives.map((objective) => <span className="chip" key={objective}>{objective}</span>)}</div>
      </div>
      <div className="challenge-meta">
        <div><div className="meta-label">Difficulty</div><div className="difficulty" aria-label={`${challenge.difficulty} out of 5 difficulty`}>{filled}<span>{empty}</span></div></div>
        <div><div className="meta-label">Est. time</div><strong style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{challenge.estimatedTime}</strong></div>
        <button className="button" disabled={busy} onClick={() => onReplay(challenge.id)}>{busy ? "Preparing..." : "Start replay"}</button>
      </div>
    </article>
  );
}
