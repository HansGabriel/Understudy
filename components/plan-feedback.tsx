import { CoachingSourceChip } from "@/components/coaching-source";
import type { SessionRecord } from "@/lib/schemas";

export function PlanFeedback({ plan }: { plan: SessionRecord["plan"] }) {
  const rows = plan.feedback?.rows ?? plan.answers.map((answer, index) => ({ answer: index + 1, assessment: answer || "Add a concrete observation." }));
  const question = plan.feedback?.sharpeningQuestion ?? plan.aiFeedback;
  return <div className="plan-feedback-detail">
    <div className="plan-feedback-rows">{rows.map((row) => <div key={row.answer}><span>{row.answer}</span><p>{row.assessment}</p></div>)}</div>
    <div className="plan-feedback-question"><CoachingSourceChip source={plan.aiSource} /><strong>Sharpening question</strong><p>{question}</p></div>
  </div>;
}
