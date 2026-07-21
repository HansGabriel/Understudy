"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChallengeDraft, ProjectCommit, ProjectKataTask, PublicChallenge } from "@/lib/schemas";
import { MIN_INPUT_LENGTH } from "@/lib/input";
import { tagTone } from "@/lib/tag-tone";

type CommitPickerProps = {
  projectId: string;
  onChallengeCreated: (challenge: PublicChallenge) => void;
};

type DraftResponse = { challenge: PublicChallenge; draft: ChallengeDraft; source: "ai" | "blank" };

function updateArray<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

export function CommitPicker({ projectId, onChallengeCreated }: CommitPickerProps) {
  const [tasks, setTasks] = useState<ProjectKataTask[]>([]);
  const [commits, setCommits] = useState<ProjectCommit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [guidance, setGuidance] = useState("");
  const [appliedGuidance, setAppliedGuidance] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [draftResponse, setDraftResponse] = useState<DraftResponse | null>(null);
  const [draft, setDraft] = useState<ChallengeDraft | null>(null);
  const draftEditorRef = useRef<HTMLDivElement>(null);

  const loadTasks = useCallback(async (nextGuidance = appliedGuidance) => {
    setError("");
    const query = nextGuidance ? `?guidance=${encodeURIComponent(nextGuidance)}` : "";
    const response = await fetch(`/api/projects/${projectId}/tasks${query}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not draft task cards.");
    setTasks(data as ProjectKataTask[]);
  }, [appliedGuidance, projectId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadTasks().catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not draft task cards."); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [loadTasks]);

  useEffect(() => {
    if (!showRaw) return;
    let cancelled = false;
    void fetch(`/api/projects/${projectId}/commits`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject(await response.json()))
      .then((data: ProjectCommit[]) => { if (!cancelled) setCommits(data); })
      .catch((reason) => { if (!cancelled) setError(reason.error ?? "Could not scan recent commits."); });
    return () => { cancelled = true; };
  }, [projectId, showRaw]);

  async function draftTasks() {
    const nextGuidance = guidance.trim();
    if (nextGuidance && nextGuidance.length < MIN_INPUT_LENGTH) {
      setError(`Describe the practice interest in at least ${MIN_INPUT_LENGTH} characters, or leave it blank for the default task board.`);
      return;
    }
    setBusy("draft");
    setAppliedGuidance(nextGuidance);
    try {
      await loadTasks(nextGuidance);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not draft task cards.");
    } finally {
      setBusy("");
    }
  }

  async function createReplay(sha: string) {
    setBusy(sha); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/replays`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha, guidance: appliedGuidance || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not prepare this replay.");
      const result = data as DraftResponse;
      setDraftResponse(result);
      setDraft(result.draft);
      onChallengeCreated(result.challenge);
      window.setTimeout(() => draftEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare this replay.");
    } finally { setBusy(""); }
  }

  async function regenerate(task: ProjectKataTask) {
    setBusy(`regenerate-${task.sha}`); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha: task.sha, guidance: appliedGuidance || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not regenerate this task.");
      setTasks((current) => current.map((entry) => entry.sha === task.sha ? data as ProjectKataTask : entry));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not regenerate this task.");
    } finally { setBusy(""); }
  }

  async function saveDraft() {
    if (!draftResponse || !draft) return;
    setBusy("save"); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/replays/${draftResponse.challenge.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the draft.");
      const result = data as { challenge: PublicChallenge; draft: ChallengeDraft };
      setDraftResponse((current) => current ? { ...current, challenge: result.challenge, draft: result.draft } : current);
      setDraft(result.draft);
      onChallengeCreated(result.challenge);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the draft.");
    } finally { setBusy(""); }
  }

  return <section className="card commit-picker task-board">
    <div className="commit-picker-head"><div><p className="eyebrow">Task board</p><h2>Pick a real change to rebuild.</h2><p>Understudy turns recent history into practice cards. Tests still decide the result.</p></div><button className="button quiet small" disabled={busy !== ""} onClick={() => setShowRaw((current) => !current)}>{showRaw ? "Hide raw commits" : "Browse raw commits"}</button></div>
    <form className="task-guidance" onSubmit={(event) => { event.preventDefault(); void draftTasks(); }}><label htmlFor="practice-guidance">What do you want to practice?</label><input id="practice-guidance" value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="e.g. async failure handling or state persistence" minLength={3} maxLength={600} disabled={busy !== ""} /><button className="button secondary small" disabled={busy !== ""}>{busy === "draft" ? "Drafting..." : "Draft tasks"}</button></form>
    {error ? <p className="notice error-notice">{error}</p> : null}
    {!tasks.length && !error ? <p className="commit-empty">Turning history into practice tasks...</p> : <div className="kata-task-grid">{tasks.map((task) => <article className="kata-task-card" key={task.sha}><div className="kata-card-top"><span className={`difficulty-chip difficulty-${task.difficulty}`}>rank {task.difficulty}/5</span><span className="technical-label">{task.estimatedTime}</span>{task.source === "authored" ? <span className="sample-badge">needs wording</span> : null}</div><h3>{task.title}</h3><p>{task.brief.story ?? task.brief.desiredBehavior}</p><div className="chip-row">{task.tags.map((tag) => <span className={`chip tag-chip tone-${tagTone(tag)}`} key={tag}>{tag}</span>)}</div><small>{task.sha.slice(0, 10)} · {task.subject || "untitled commit"}</small><div className="action-row"><button className="button cobalt small" disabled={busy !== ""} onClick={() => void createReplay(task.sha)}>{busy === task.sha ? "Preparing..." : "Open task"}</button><button className="button quiet small" disabled={busy !== ""} onClick={() => void regenerate(task)}>{busy === `regenerate-${task.sha}` ? "Redrafting..." : "Regenerate"}</button></div><small className="task-open-note">First open validates this commit and can take 1–2 minutes.</small>{busy === task.sha ? <p className="commit-empty">Validating the commit and preparing your editable draft…</p> : null}</article>)}</div>}
    {showRaw ? <div className="commit-list raw-commit-list">{commits.map((commit) => <article className="commit-row" key={commit.sha}><div><strong>{commit.subject || "(no subject)"}</strong><span className="commit-meta">{commit.sha.slice(0, 10)} · {new Date(commit.date).toLocaleDateString()} · {commit.filesChanged.length} files</span><span className={`commit-badge ${commit.replayable ? "replayable" : commit.validationStatus === "pending" ? "pending" : "unchecked"}`}>{commit.badge}</span></div><button className="button secondary small" disabled={busy !== ""} onClick={() => void createReplay(commit.sha)}>{busy === commit.sha ? "Preparing..." : "Open task"}</button></article>)}</div> : null}
    {draftResponse && draft ? <div className="draft-editor" ref={draftEditorRef}><div className="draft-editor-head"><div><p className="eyebrow">{draftResponse.source === "ai" ? "AI-drafted task" : "Editable template"}</p><h3>Make the task your own before first use.</h3></div><span className="sample-badge">{draftResponse.source === "ai" ? "AI-drafted" : "needs wording"}</span></div><label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Story<textarea value={draft.brief.story ?? ""} onChange={(event) => setDraft({ ...draft, brief: { ...draft.brief, story: event.target.value || undefined } })} /></label><label>Your task<textarea value={draft.brief.desiredBehavior} onChange={(event) => setDraft({ ...draft, brief: { ...draft.brief, desiredBehavior: event.target.value } })} /></label><div className="draft-columns"><label>Requirements{draft.brief.acceptanceCriteria.map((value, index) => <input key={index} value={value} onChange={(event) => setDraft({ ...draft, brief: { ...draft.brief, acceptanceCriteria: updateArray(draft.brief.acceptanceCriteria, index, event.target.value) } })} />)}</label><label>Boundaries{draft.brief.constraints.map((value, index) => <input key={index} value={value} onChange={(event) => setDraft({ ...draft, brief: { ...draft.brief, constraints: updateArray(draft.brief.constraints, index, event.target.value) } })} />)}</label></div><label>Example<input value={draft.brief.example ?? ""} onChange={(event) => setDraft({ ...draft, brief: { ...draft.brief, example: event.target.value || undefined } })} /></label><button className="button cobalt" disabled={busy !== ""} onClick={() => void saveDraft()}>{busy === "save" ? "Saving..." : "Save task"}</button></div> : null}
  </section>;
}
