"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ChallengeCard, type ChallengeProgress } from "@/components/challenge-card";
import { CommitPicker } from "@/components/commit-picker";
import { VariationForge } from "@/components/variation-forge";
import type { ProjectSummary, PublicChallenge } from "@/lib/schemas";

const comingSoon = [
  {
    id: "debounced-search",
    title: "Debounced search with cancellation",
    description: "The next fixture replay is being authored with a reproducible failing behavior and alternate valid solution.",
    tags: ["debounced search", "cancellation"],
  },
] as const;

type LibraryEntry =
  | { kind: "challenge"; challenge: PublicChallenge }
  | (typeof comingSoon)[number] & { kind: "coming-soon" };

type RecentPayload = {
  total: number;
  challengeStates?: Record<string, ChallengeProgress>;
};

const selectedProjectStorageKey = "understudy:selected-project";
const defaultProject: ProjectSummary = { id: "task-manager", name: "task-manager", mode: "built-in", detected: { packageManager: "npm", testCommand: "test" }, consent: true };

export default function LibraryPage() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<PublicChallenge[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [challengeProgress, setChallengeProgress] = useState<Record<string, ChallengeProgress>>({});
  const [hasSessions, setHasSessions] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([defaultProject]);
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProject.id);
  const fixtureUnavailable = /fixture|fixture:build/i.test(error);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? defaultProject;
  const isLinkedProject = selectedProject.mode === "linked";
  const visibleChallenges = challenges.filter((challenge) => challenge.projectId === selectedProjectId);
  const baseChallengeForForge = visibleChallenges.find((challenge) => !challenge.drafted && !challenge.id.startsWith("variation-"));
  const entries: LibraryEntry[] = visibleChallenges.length
    ? [
        ...visibleChallenges.map((challenge) => ({ kind: "challenge" as const, challenge })),
        ...(selectedProject.mode === "built-in" ? comingSoon.map((entry) => ({ kind: "coming-soon" as const, ...entry })) : []),
      ]
    : [];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/challenges")
      .then(async (response) => response.ok ? response.json() : Promise.reject(await response.json()))
      .then((data: PublicChallenge[]) => { if (!cancelled) setChallenges(data); })
      .catch((reason) => { if (!cancelled) setError(reason.error ?? "Could not load replay challenges."); });
    fetch("/api/sessions/recent")
      .then(async (response) => response.ok ? response.json() : Promise.reject(await response.json()))
      .then((data: RecentPayload) => {
        if (cancelled) return;
        setHasSessions(data.total > 0);
        setChallengeProgress(data.challengeStates ?? {});
      })
      .catch(() => {
        // Progress is additive; the library remains usable if the local index is unavailable.
      });
    const savedProject = window.localStorage.getItem(selectedProjectStorageKey);
    const handleProjectChange = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; project?: ProjectSummary }>).detail;
      if (detail?.project) setProjects((current) => current.some((project) => project.id === detail.project?.id) ? current : [...current, detail.project!]);
      if (detail?.projectId) setSelectedProjectId(detail.projectId);
    };
    const loadProjects = async () => {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) return;
      const nextProjects = data as ProjectSummary[];
      setProjects(nextProjects.length ? nextProjects : [defaultProject]);
      setSelectedProjectId(savedProject && nextProjects.some((project) => project.id === savedProject) ? savedProject : defaultProject.id);
    };
    window.addEventListener("understudy:project-change", handleProjectChange);
    void loadProjects();
    return () => { cancelled = true; window.removeEventListener("understudy:project-change", handleProjectChange); };
  }, []);

  async function replay(challengeId: string) {
    setBusy(challengeId);
    setError("");
    try {
      let response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId }) });
      let data = await response.json();
      if (response.status === 409 && data.sessionId) {
        const resume = window.confirm("You already passed this replay. Click OK to resume the explain-back, or Cancel to discard it and start fresh.");
        if (resume) {
          router.push(`/session/${data.sessionId}`);
          return;
        }
        const discardResponse = await fetch(`/api/sessions/${data.sessionId}`, { method: "DELETE" });
        const discardData = await discardResponse.json();
        if (!discardResponse.ok) throw new Error(discardData.error ?? "Could not discard the passed session.");
        response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId }) });
        data = await response.json();
      }
      if (!response.ok) throw new Error(data.error ?? "Could not prepare a worktree.");
      router.push(`/session/${data.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare a worktree.");
      setBusy("");
    }
  }

  function renderEntry(entry: LibraryEntry) {
    return entry.kind === "challenge"
      ? <ChallengeCard key={entry.challenge.id} challenge={entry.challenge} progress={challengeProgress[entry.challenge.id]} busy={busy === entry.challenge.id} onReplay={replay} />
      : <article className="coming-soon" key={entry.id}><span className="replay-tag">IN AUTHORING</span><h2>{entry.title}</h2><p>{entry.description}</p><div className="chip-row">{entry.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}</div></article>;
  }

  function handleDraftedChallenge(challenge: PublicChallenge) {
    setChallenges((current) => current.some((entry) => entry.id === challenge.id) ? current.map((entry) => entry.id === challenge.id ? challenge : entry) : [...current, challenge]);
  }

  return (
    <AppShell active="library">
      <header className="page-head library-head">
        <div><p className="eyebrow">{selectedProject.id === "task-manager" ? "One practice project / two real changes" : `${selectedProject.name} / project library preview`}</p><h1>Learn from real history: Understudy drops you at the commit before a meaningful change and asks you to rebuild it yourself.</h1><p>A replay is a guided chance to rebuild a real change from this project&apos;s history. You make the change in your own editor; the project&apos;s tests show when the behavior is right.</p></div>
      </header>
      <section className="page-content">
        {!hasSessions ? <section className="how-it-works" aria-labelledby="how-it-works-title">
          <div className="how-it-works-head"><p className="eyebrow">How this works</p><h2 id="how-it-works-title">A short loop around a real, local code change.</h2></div>
          <ol>
            <li><span>1</span><p><strong>Pick a focused replay.</strong> Start from a real change in this project&apos;s history.</p></li>
            <li><span>2</span><p><strong>Open your working copy.</strong> Make the change in your own editor.</p></li>
            <li><span>3</span><p><strong>Prove the behavior.</strong> Run the tests, use coaching if useful, and explain your reasoning.</p></li>
          </ol>
        </section> : null}
        {isLinkedProject ? <>
          <CommitPicker projectId={selectedProject.id} onChallengeCreated={handleDraftedChallenge} />
          {entries.length ? entries.map(renderEntry) : <article className="card setup-card project-empty-state"><p className="eyebrow">Project library</p><h2>No drafted challenges yet.</h2><p>Create a replay from a self-validating commit above. The saved draft will appear here for practice.</p></article>}
        </> : fixtureUnavailable ? <article className="card setup-card">
          <p className="eyebrow">Local setup required</p>
          <h2>Build the task-manager fixture before practicing.</h2>
          <p>{error}</p>
          <p>From the repository root, run <code>npm run fixture:build</code>, then reload this page.</p>
        </article> : error ? <article className="card setup-card">
          <p className="eyebrow">Could not load the replay library</p>
          <h2>Try refreshing the local app.</h2>
          <p>{error}</p>
        </article> : selectedProject.mode === "linked" ? <article className="card setup-card project-empty-state"><p className="eyebrow">Stage B preview</p><h2>No challenges yet — pick a commit to replay</h2><p>This repository is registered and ready for the next project-library step. Commit discovery is intentionally not included in this pass.</p></article> : entries.length ? entries.map((entry) => entry.kind === "challenge"
          ? <ChallengeCard key={entry.challenge.id} challenge={entry.challenge} progress={challengeProgress[entry.challenge.id]} busy={busy === entry.challenge.id} onReplay={replay} />
          : <article className="coming-soon" key={entry.id}><span className="replay-tag">IN AUTHORING</span><h2>{entry.title}</h2><p>{entry.description}</p><div className="chip-row">{entry.tags.map((tag) => <span className="chip" key={tag}>{tag}</span>)}</div></article>)
          : <article className="card challenge-card"><div><p className="eyebrow">Loading local challenge manifests</p><h2>Preparing the replay library</h2><p>Checking the public manifest data while reference commits remain server-only.</p></div></article>}
        <p className="sample-report-link"><Link href="/report/sample">View a sample mastery report</Link></p>
        {selectedProject.id === "task-manager" && baseChallengeForForge ? <VariationForge challengeId={baseChallengeForForge.id} baseChallenges={visibleChallenges.filter((challenge) => !challenge.drafted && !challenge.id.startsWith("variation-"))} onCreated={handleDraftedChallenge} /> : null}
      </section>
    </AppShell>
  );
}
