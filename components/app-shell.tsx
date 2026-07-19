"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/schemas";

type AppShellProps = {
  active: "library" | "session" | "report";
  children: ReactNode;
};

type RecentSession = {
  id: string;
  challengeId: string;
  challengeTitle: string;
  status: "planning" | "coding" | "passed" | "completed";
  createdAt: string;
};

type RecentPayload = {
  sessions: RecentSession[];
  total: number;
};

const defaultProject: ProjectSummary = { id: "task-manager", name: "task-manager", mode: "built-in", detected: { packageManager: "npm", testCommand: "test" }, consent: true };
const selectedProjectStorageKey = "understudy:selected-project";

const stageLabel = {
  library: "Choose a replay",
  session: "Practice in your working copy",
  report: "Review learning evidence",
} as const;

function formatSessionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "unknown date";
  const today = new Date();
  if (date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) return "today";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function AppShell({ active, children }: AppShellProps) {
  const [recent, setRecent] = useState<RecentPayload>({ sessions: [], total: 0 });
  const [projects, setProjects] = useState<ProjectSummary[]>([defaultProject]);
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProject.id);
  const [projectPath, setProjectPath] = useState("");
  const [projectError, setProjectError] = useState("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectConsent, setProjectConsent] = useState(false);

  function selectProject(projectId: string, project?: ProjectSummary) {
    setSelectedProjectId(projectId);
    window.localStorage.setItem(selectedProjectStorageKey, projectId);
    window.dispatchEvent(new CustomEvent("understudy:project-change", { detail: { projectId, project } }));
  }

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectBusy(true); setProjectError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: projectPath, consent: projectConsent }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not add this project.");
      const project = data as ProjectSummary;
      setProjects((current) => current.some((entry) => entry.id === project.id) ? current : [...current, project]);
      setProjectPath("");
      setProjectConsent(false);
      setShowProjectForm(false);
      selectProject(project.id, project);
    } catch (reason) {
      setProjectError(reason instanceof Error ? reason.message : "Could not add this project.");
    } finally { setProjectBusy(false); }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sessions/recent", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : Promise.reject(await response.json())))
      .then((payload: RecentPayload) => {
        if (!cancelled) setRecent(payload);
      })
      .catch(() => {
        // The shell should remain useful if the local session index is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : Promise.reject(await response.json())))
      .then((data: ProjectSummary[]) => {
        if (cancelled) return;
        const nextProjects = data.length ? data : [defaultProject];
        setProjects(nextProjects);
        const saved = window.localStorage.getItem(selectedProjectStorageKey);
        const nextId = saved && nextProjects.some((project) => project.id === saved) ? saved : defaultProject.id;
        setSelectedProjectId(nextId);
        window.dispatchEvent(new CustomEvent("understudy:project-change", { detail: { projectId: nextId } }));
      })
      .catch(() => {
        // The bundled project remains usable if the registry is unavailable.
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="app-shell" style={{ padding: 0 }}>
      <section className="product-frame" style={{ maxWidth: "none", minHeight: "100vh", border: 0, borderRadius: 0, boxShadow: "none" }} aria-label="Understudy application">
        <header className="product-bar">
          <Link className="brand" href="/" aria-label="Understudy practice library">
            <span className="brand-mark" aria-hidden="true">U</span>
            <span><strong>Understudy</strong><small>guided code replays</small></span>
          </Link>
          <div className="product-context">
            <span className="local-badge"><i aria-hidden="true" />Local runtime</span>
            <span className="stage-label">{stageLabel[active]}</span>
          </div>
        </header>
        <div className="shell-body">
          <aside className="sidebar">
            <div>
              <p className="eyebrow">Practice project</p>
              <div className="project-select"><label htmlFor="project-picker">Practice project</label><select id="project-picker" value={selectedProjectId} onChange={(event) => selectProject(event.target.value)}>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><span>{projects.find((project) => project.id === selectedProjectId)?.mode === "linked" ? "linked local repository" : "bundled practice project"}</span></div>
              <p className="fixture-note">Improve it in your own working copy.</p>
              <button className="project-roadmap" type="button" onClick={() => { setShowProjectForm((open) => !open); setProjectError(""); }}>
                <strong>{showProjectForm ? "Close project loader" : "Load a different project"}</strong>
                <span>Add a local npm + Vitest/Jest repository for the project library.</span>
              </button>
              {showProjectForm ? <form className="project-import" onSubmit={addProject}><label htmlFor="project-path">Absolute local repository path</label><input id="project-path" value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="C:\\work\\my-repo" autoComplete="off" /><label className="consent-check"><input type="checkbox" checked={projectConsent} onChange={(event) => setProjectConsent(event.target.checked)} required /> <span>I understand replays run this repository&apos;s own tests on my machine.</span></label>{projectError ? <small>{projectError}</small> : null}<button className="button secondary small" disabled={projectBusy || projectPath.trim().length < 1 || !projectConsent}>{projectBusy ? "Checking..." : "Add project"}</button></form> : null}
            </div>
            <div>
              <p className="eyebrow">Learning loop</p>
              <nav className="nav-list" aria-label="Learning loop">
                <Link className={`nav-item ${active === "library" ? "active" : ""}`} href="/">Choose replay</Link>
                <span className={`nav-item ${active === "session" ? "active" : ""}`}>Plan and verify</span>
                <span className={`nav-item ${active === "report" ? "active" : ""}`}>Review evidence</span>
              </nav>
            </div>
            <div className="recent-sessions">
              <p className="eyebrow">Recent</p>
              {recent.sessions.length ? (
                <div className="recent-list">
                  {recent.sessions.map((session) => (
                    <Link
                      className="recent-session"
                      href={session.status === "completed" ? `/report/${session.id}` : `/session/${session.id}`}
                      key={session.id}
                    >
                      <strong>{session.challengeTitle}</strong>
                      <span>{session.status === "completed" ? "passed" : session.status} · {formatSessionDate(session.createdAt)}</span>
                    </Link>
                  ))}
                </div>
              ) : <p className="recent-empty">No saved sessions yet.</p>}
            </div>
            <p className="sidebar-foot">{recent.total} sessions saved<br />Your working copies stay isolated<br />Tests decide outcomes</p>
          </aside>
          <section className="workspace">{children}</section>
        </div>
      </section>
    </main>
  );
}
