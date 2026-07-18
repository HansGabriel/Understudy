"use client";

import { useEffect, useState } from "react";
import type { PublicChallenge } from "@/lib/schemas";

export function VariationForge({ challengeId, baseChallenges, onCreated }: { challengeId: string; baseChallenges: PublicChallenge[]; onCreated: (challenge: PublicChallenge) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState(challengeId);
  const [stageIndex, setStageIndex] = useState(0);
  const stages = ["Installing dependencies", "Running the base suite", "Validating the hidden test", "Publishing the validated replay"];

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setStageIndex((current) => Math.min(current + 1, stages.length - 1)), 8_000);
    return () => window.clearInterval(timer);
  }, [busy, stages.length]);

  async function generate() {
    if (busy) return;
    setStageIndex(0); setBusy(true); setError("");
    try {
      const response = await fetch("/api/forge/variations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: selectedChallengeId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not validate a variation.");
      onCreated(data.challenge as PublicChallenge);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not validate a variation.");
    } finally { setBusy(false); }
  }

  return <div className="variation-forge"><label>Base replay<select value={selectedChallengeId} onChange={(event) => setSelectedChallengeId(event.target.value)} disabled={busy}>{baseChallenges.map((challenge) => <option value={challenge.id} key={challenge.id}>{challenge.title}</option>)}</select></label><button className="button secondary small" onClick={() => void generate()} disabled={busy}>{busy ? `${stages[stageIndex]}…` : "Generate a validated variation"}</button>{busy ? <span>Private validation can take about two minutes. {stages[stageIndex]}.</span> : error ? <small>{error}</small> : <span>GPT-5.6 proposals stay private until base-fails/reference-passes validation.</span>}</div>;
}
