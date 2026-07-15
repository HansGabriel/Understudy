"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard } from "@/components/challenge-card";
import type { PublicChallenge } from "@/lib/schemas";

export default function LibraryPage() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<PublicChallenge[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    fetch("/api/challenges")
      .then(async (response) => response.ok ? response.json() : Promise.reject(await response.json()))
      .then(setChallenges)
      .catch((reason) => setError(reason.error ?? "Could not load replay challenges."));
  }, []);

  async function replay(challengeId: string) {
    setBusy(challengeId);
    setError("");
    try {
      const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not prepare a worktree.");
      router.push(`/session/${data.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare a worktree.");
      setBusy("");
    }
  }

  return (
    <AppShell active="library">
      <header className="page-head">
        <div><p className="eyebrow">Task-manager fixture / 2 curated replays</p><h1>Practice with a real worktree.</h1><p>Each replay starts from a pinned commit in the bundled repository. Plan the behavior, rebuild it in your own editor, and let deterministic checks show what you missed.</p></div>
      </header>
      {error ? <p className="notice error-notice">{error}</p> : null}
      <section className="page-content">
        {challenges.length ? challenges.map((challenge) => <ChallengeCard key={challenge.id} challenge={challenge} busy={busy === challenge.id} onReplay={replay} />) : <article className="card challenge-card"><div><p className="eyebrow">Loading local challenge manifests</p><h2>Preparing the replay library</h2><p>Checking the public manifest data while reference commits remain server-only.</p></div></article>}
        <article className="coming-soon"><span className="replay-tag">IN AUTHORING</span><h2>Debounced search with cancellation</h2><p>The next fixture replay is being authored with a reproducible failing behavior and alternate valid solution.</p></article>
      </section>
    </AppShell>
  );
}
