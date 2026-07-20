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
const defaultProject: ProjectSummary = { id: "kata-lab", name: "Kata Lab", mode: "built-in", detected: { packageManager: "npm", testCommand: "test" }, consent: true };

function conciseActionError(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : fallback;
  return message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 2).join("\n") || fallback;
}

export default function LibraryPage() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<PublicChallenge[]>([]);
  const [error, setError] = useState("");
  const [challengeLoadComplete, setChallengeLoadComplete] = useState(false);
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
        ...(selectedProject.id === "task-manager" ? comingSoon.map((entry) => ({ kind: "coming-soon" as const, ...entry })) : []),
      ]
    : [];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/challenges")
      .then(async (response) => response.ok ? response.json() : Promise.reject(await response.json()))
      .then((data: PublicChallenge[]) => { if (!cancelled) { setChallenges(data); setChallengeLoadComplete(true); } })
      .catch((reason) => { if (!cancelled) { setError(reason.error ?? "Could not load replay challenges."); setChallengeLoadComplete(true); } });
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
      setError(conciseActionError(reason, "Could not prepare a worktree."));
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
        <div><p className="eyebrow">{selectedProject.id === "kata-lab" ? "Four kata replays / easy to medium" : selectedProject.id === "task-manager" ? "Two task-manager replays" : `${selectedProject.name} / tasks`}</p><h1>Learn from real history: Understudy drops you at the commit before a meaningful change and asks you to rebuild it yourself.</h1><p>{selectedProject.id === "kata-lab" ? "Practice small algorithm changes in your own editor. Tests decide when the behavior is right." : "Rebuild it in your own editor. Tests decide when it works."}</p></div>
      </header>
      <section className="page-content">
        {!hasSessions ? <details className="how-it-works" open>
          <summary><span className="eyebrow">How it works</span><strong id="how-it-works-title">A short loop around a real change.</strong></summary>
          <ol>
            <li><span>1</span><p><strong>Pick a replay.</strong> Start from real history.</p></li>
            <li><span>2</span><p><strong>Open your copy.</strong> Work in your own editor.</p></li>
            <li><span>3</span><p><strong>Prove it.</strong> Let the tests decide.</p></li>
          </ol>
        </details> : null}
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
        </article> : entries.length ? entries.map(renderEntry) : challengeLoadComplete ? <article className="card setup-card"><p className="eyebrow">Replay library</p><h2>0 challenges loaded.</h2><p>Check the server logs for an invalid challenge manifest, then reload the local app.</p></article> : <article className="card challenge-card"><div><p className="eyebrow">Loading local challenge manifests</p><h2>Preparing the replay library</h2><p>Checking the public manifest data while reference commits remain server-only.</p></div></article>}
        <p className="sample-report-link"><Link href="/report/sample">View a sample mastery report</Link></p>
        {selectedProject.id === "task-manager" && baseChallengeForForge ? <VariationForge challengeId={baseChallengeForForge.id} baseChallenges={visibleChallenges.filter((challenge) => !challenge.drafted && !challenge.id.startsWith("variation-"))} onCreated={handleDraftedChallenge} /> : null}
      </section>
    </AppShell>
  );
}
