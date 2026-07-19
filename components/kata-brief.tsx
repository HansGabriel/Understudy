import type { PublicChallenge, SessionRecord } from "@/lib/schemas";

export function KataBrief({ challenge, status = "planning" }: { challenge: PublicChallenge; status?: SessionRecord["status"] }) {
  const brief = challenge.brief;
  const activeStep = status === "planning" ? 0 : status === "coding" ? 1 : status === "passed" ? 2 : 3;
  const steps = ["Plan", "Verify", "Explain", "Report"];
  return <article className="card brief-card kata-brief">
    <div className="kata-brief-topline"><span className="replay-tag">REPLAY</span><span className={`difficulty-chip difficulty-${challenge.difficulty}`} aria-label={`${challenge.difficulty} out of 5 difficulty`}>{"●".repeat(challenge.difficulty)}<span>{"●".repeat(5 - challenge.difficulty)}</span></span></div>
    <h2>{challenge.title}</h2>
    {brief.story ? <section className="brief-section"><p className="eyebrow">Story</p><p>{brief.story}</p></section> : null}
    <section className="brief-section"><p className="eyebrow">Your task</p><p>{brief.desiredBehavior}</p></section>
    <section className="brief-section"><p className="eyebrow">Requirements</p><ol>{brief.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}</ol></section>
    {brief.example ? <section className="brief-section brief-example"><p className="eyebrow">Example</p><p>{brief.example}</p></section> : null}
    <section className="brief-section brief-boundary"><p className="eyebrow">Boundaries</p><p>{brief.constraints.join(" / ")}</p></section>
    <div className="stepper">{steps.map((step, index) => <div key={step} className={status === "completed" || index < activeStep ? "done" : index === activeStep ? "current" : ""}><i />{step}</div>)}</div>
  </article>;
}
