import type { SessionRecord } from "@/lib/schemas";
import { CoachingSourceChip } from "@/components/coaching-source";

const copy: Record<SessionRecord["timeline"][number]["type"], string> = {
  plan_submitted: "Plan submitted",
  attempt: "Test attempt",
  signal_failure: "Hidden edge case failed",
  hint: "Hint requested",
  all_passed: "All checks passed",
  explained: "Explanation completed",
  coach: "Coach exchange",
  outline: "Approach outline used",
};

export function SessionTimeline({ session }: { session: SessionRecord }) {
  return (
    <section className="card timeline">
      <div className="timeline-title"><span>Session timeline · git log --graph</span><span>{session.timeline.length} beats</span></div>
      <div className="timeline-list">
        {session.timeline.map((event, index) => {
          const signal = event.type === "signal_failure";
          const pass = event.type === "all_passed";
          return (
            <article className={`timeline-event ${signal ? "signal" : pass ? "pass" : ""}`} key={`${event.at}-${index}`}>
              <time className="timeline-time">{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              <h3>{copy[event.type]}{event.source ? <CoachingSourceChip source={event.source} /> : null}</h3>
              <p>{event.type === "signal_failure" ? "The normal suite passed, but the behavioral test found the edge case that the first attempt missed." : event.type === "hint" ? `Level ${event.meta.level} was revealed deliberately.` : event.type === "all_passed" ? "Normal suite and behavioral test are green together." : event.type === "attempt" ? "Checks captured an honest snapshot of the worktree." : event.type === "plan_submitted" ? "Three planning answers were recorded before coding." : event.type === "coach" ? `Coach exchange ${event.meta.messageCount ?? "recorded"}; help used is context, not a penalty.` : event.type === "outline" ? "A high-level approach was saved before verification; tests still decide the result." : "Explain-back captured and reviewed."}</p>
              {signal && <div className="event-detail">{String(event.meta.assertion ?? "Behavioral edge case failed")}</div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
