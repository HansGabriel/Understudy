"use client";

import { useState } from "react";
import type { PublicChallenge } from "@/lib/schemas";

export function VariationForge({ challengeId, baseChallenges, onCreated }: { challengeId: string; baseChallenges: PublicChallenge[]; onCreated: (challenge: PublicChallenge) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState(challengeId);
  const [guidance, setGuidance] = useState("");
  async function generate() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/forge/variations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: selectedChallengeId, guidance: guidance.trim() || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not validate a variation.");
      onCreated(data.challenge as PublicChallenge);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not validate a variation.");
    } finally { setBusy(false); }
  }

  return <div className="variation-forge"><label>Base replay<select value={selectedChallengeId} onChange={(event) => setSelectedChallengeId(event.target.value)} disabled={busy}>{baseChallenges.map((challenge) => <option value={challenge.id} key={challenge.id}>{challenge.title}</option>)}</select></label><label className="variation-guidance">Describe the task you want<input value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="e.g. retry behavior" maxLength={600} disabled={busy} /></label><p className="forge-warning">Private validation takes about two minutes and publishes only a base-fails/reference-passes replay.</p><button className="button secondary small" onClick={() => void generate()} disabled={busy}>{busy ? "Validating variation..." : "Generate a validated variation"}</button>{busy ? <span className="forge-progress" role="status"><span className="progress-dot" />The server is running the private validation gate.</span> : error ? <small>{error}</small> : <span>GPT-5.6 proposals stay private until base-fails/reference-passes validation.</span>}</div>;
}
