import { CoachingSourceChip } from "@/components/coaching-source";
import type { SessionRecord } from "@/lib/schemas";

export function ApproachOutline({ outline }: { outline: NonNullable<SessionRecord["outline"]> }) {
  return <section className="card approach-outline">
    <div><p className="eyebrow">Approach outline <CoachingSourceChip source={outline.source} /></p><h2>A way to investigate, not a patch.</h2></div>
    <ol>{outline.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
  </section>;
}
