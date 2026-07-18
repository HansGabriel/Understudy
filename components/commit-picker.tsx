"use client";

import { useEffect, useState } from "react";
import type { ChallengeDraft, ProjectCommit, PublicChallenge } from "@/lib/schemas";

type CommitPickerProps = {
  projectId: string;
  onChallengeCreated: (challenge: PublicChallenge) => void;
};

type DraftResponse = { challenge: PublicChallenge; draft: ChallengeDraft; source: "ai" | "blank" };

function updateArray<T>(items: T[], index: number, value: T) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

export function CommitPicker({ projectId, onChallengeCreated }: CommitPickerProps) {
  const [commits, setCommits] = useState<ProjectCommit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [draftResponse, setDraftResponse] = useState<DraftResponse | null>(null);
  const [draft, setDraft] = useState<ChallengeDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/commits`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : Promise.reject(await response.json()))
      .then((data: ProjectCommit[]) => { if (!cancelled) setCommits(data); })
      .catch((reason) => { if (!cancelled) setError(reason.error ?? "Could not scan recent commits."); });
    return () => { cancelled = true; };
  }, [projectId]);

  async function createReplay(sha: string) {
    setBusy(sha); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/replays`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not draft this replay.");
      const result = data as DraftResponse;
      setDraftResponse(result);
      setDraft(result.draft);
      onChallengeCreated(result.challenge);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not draft this replay.");
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

  return <section className="card commit-picker">
     <div className="commit-picker-head"><div><p className="eyebrow">Linked project / commit picker</p><h2>Choose a real change to replay.</h2><p>Commits that add tests validate when you create a replay; only a parent-fails/reference-passes result earns the self-validating badge.</p></div><span className="technical-label">last 50 commits</span></div>
    {error ? <p className="notice error-notice">{error}</p> : null}
     {!commits.length && !error ? <p className="commit-empty">Scanning recent history…</p> : <div className="commit-list">
      {commits.map((commit) => <article className="commit-row" key={commit.sha}>
          <div><strong>{commit.subject || "(no subject)"}</strong><span className="commit-meta">{commit.sha.slice(0, 10)} · {new Date(commit.date).toLocaleDateString()} · {commit.filesChanged.length} file{commit.filesChanged.length === 1 ? "" : "s"}</span><span className={`commit-badge ${commit.replayable ? "replayable" : commit.validationStatus === "pending" ? "pending" : "unchecked"}`}>{commit.badge}</span></div>
         <button className="button secondary small" disabled={busy !== ""} onClick={() => void createReplay(commit.sha)}>{busy === commit.sha ? (commit.validationStatus === "pending" ? "Validating…" : "Drafting...") : "Create replay"}</button>
      </article>)}
    </div>}
    {draftResponse && draft ? <div className="draft-editor">
      <div className="draft-editor-head"><div><p className="eyebrow">{draftResponse.source === "ai" ? "AI-drafted challenge" : "Editable blank template"}</p><h3>Shape the brief before first use.</h3></div><span className="sample-badge">{draftResponse.source === "ai" ? "AI-drafted" : "needs your wording"}</span></div>
      <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Desired behavior<textarea value={draft.brief.desiredBehavior} onChange={(event) => setDraft({ ...draft, brief: { ...draft.brief, desiredBehavior: event.target.value } })} /></label>
      <div className="draft-columns"><label>Acceptance criteria{draft.brief.acceptanceCriteria.map((value, index) => <input key={index} value={value} onChange={(event) => setDraft({ ...draft, brief: { ...draft.brief, acceptanceCriteria: updateArray(draft.brief.acceptanceCriteria, index, event.target.value) } })} />)}</label><label>Constraints{draft.brief.constraints.map((value, index) => <input key={index} value={value} onChange={(event) => setDraft({ ...draft, brief: { ...draft.brief, constraints: updateArray(draft.brief.constraints, index, event.target.value) } })} />)}</label></div>
      <div className="draft-columns"><label>Plan questions{draft.planQuestions.map((value, index) => <input key={index} value={value} onChange={(event) => setDraft({ ...draft, planQuestions: updateArray(draft.planQuestions, index, event.target.value) })} />)}</label><label>Hints{draft.hints.map((hint, index) => <input key={hint.level} value={hint.text} onChange={(event) => setDraft({ ...draft, hints: updateArray(draft.hints, index, { ...hint, text: event.target.value }) })} />)}</label></div>
      <label>Explain-back question<input value={draft.explainBackQuestion} onChange={(event) => setDraft({ ...draft, explainBackQuestion: event.target.value })} /></label>
      <button className="button cobalt" disabled={busy !== ""} onClick={() => void saveDraft()}>{busy === "save" ? "Saving draft..." : "Save draft"}</button>
    </div> : null}
  </section>;
}
