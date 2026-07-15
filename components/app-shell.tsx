import Link from "next/link";

type AppShellProps = {
  active: "library" | "session" | "report";
  children: React.ReactNode;
};

const stageLabel = {
  library: "Choose a replay",
  session: "Practice in a worktree",
  report: "Review learning evidence",
} as const;

export function AppShell({ active, children }: AppShellProps) {
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
            <p className="sidebar-foot">Git worktrees<br />Tests decide outcomes</p>
          </aside>
          <section className="workspace">{children}</section>
        </div>
      </section>
    </main>
  );
}
