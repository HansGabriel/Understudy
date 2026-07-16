import type { CoachingSource } from "@/lib/schemas";

export function CoachingSourceChip({ source }: { source?: CoachingSource }) {
  return <span className="coaching-source">{source === "ai" ? "GPT-5.6" : "authored coaching"}</span>;
}
