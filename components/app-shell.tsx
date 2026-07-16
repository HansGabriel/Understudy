"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

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

const stageLabel = {
  library: "Choose a replay",
  session: "Practice in a worktree",
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
              <p className="eyebrow">Practice repository</p>
              <div className="project-select"><strong>task-manager</strong><span>curated local fixture</span></div>
              <p className="fixture-note">A small, versioned repository is bundled so every replay has a reproducible starting point.</p>
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
            <p className="sidebar-foot">{recent.total} sessions saved<br />Git worktrees<br />Tests decide outcomes</p>
          </aside>
          <section className="workspace">{children}</section>
        </div>
      </section>
    </main>
  );
}
