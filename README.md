# Understudy

**Learn from real history: Understudy drops you at the commit before a meaningful change and asks you to rebuild it yourself.**

Understudy is a local, desktop-first learning lab for developers. It gives you a copy of the bundled task-manager practice project from just before a real change landed, then asks you to rebuild the behavior in your own editor. That copy is an isolated Git worktree; Understudy calls it **your working copy**. The project's own tests and one edge-case check make overlooked behavior visible. The fixture is intentionally supplied by Understudy because no learner repository has been connected.

## Run locally

Prerequisites: Node.js 20 or newer, npm, and Git. The app uses path-aware Node and Git argument-array processes, so the local workflow works on macOS, Linux, and Windows.

```bash
npm install
npm run fixture:build
npm run dev
```

Open `http://localhost:3000`. On PowerShell systems that block `npm.ps1`, use the equivalent `npm.cmd` command. The app installs the bundled fixture's pinned dependencies when it creates a worktree.

`npm run fixture:build` normally takes about 20–60 seconds on a first run because it installs the small fixture toolchain. Success prints a `Fixture ready: <base> → <optimistic> → <persist>` line and writes `fixtures/task-manager.bundle` plus the authored challenge manifests. The bundle is tracked in this repository, so most clones only need this command when rebuilding it.

Optional AI coaching uses a local `.env.local` file:

```text
OPENAI_API_KEY=your_key_here
```

Copy `.env.example` rather than committing an environment file. Without a key, every AI interaction deliberately falls back to authored coaching and the learning loop remains fully usable.

## What the replay does

1. Pick a real task-manager change from the practice library. A **replay** is a guided rebuild of a change from that project's history.
2. Answer three planning questions before editing.
3. Open your working copy (an isolated Git worktree) in your own editor.
4. Run the project's own tests and an edge-case check. Green project tests plus an amber edge-case failure is the intended signal, not a setup error.
5. Use up to three ordered hints, explain your reasoning, and review a commit-graph mastery report.

During a live session the browser never receives reference commit IDs, hidden-test paths, unrevealed hints, or a reference patch. After the learner passes both checks and submits the explain-back, the session becomes `completed` and the Mastery Report intentionally reveals the reference commit, changed-file list, and patch for side-by-side learning. The server accepts only manifest-declared package scripts; browser input never reaches a shell command.

## Verification

```bash
npm run validate:challenges
npm run test
npm run lint
npm run build
```

`validate:challenges` proves that each challenge fails at its base commit and passes at its authored reference commit; it also checks an alternate correct rollback implementation for the hero challenge.

### Troubleshooting

- **PowerShell says scripts are disabled or blocks `npm.ps1`:** run the same commands with `npm.cmd`, for example `npm.cmd run fixture:build`.
- **`git` is missing:** install Git, restart the terminal, and confirm `git --version` works. Fixture creation and replay worktrees both require it.
- **Node is too old:** Understudy requires Node 20 or newer. Check with `node --version`, then install a current LTS release before running `npm install`.
- **The library says the fixture is not ready:** from the repository root, run `npm run fixture:build`, wait for the `Fixture ready` line, and reload the app.

## Build Week — Education

Understudy is prepared for the Education category: it teaches developers to reason about behavior, tests, failure modes, and independence rather than receive generated patches. See `docs/demo-script.md` and `docs/submission-checklist.md` for the planned submission materials.

### How Codex and GPT-5.6 are used

Codex accelerated the app's implementation, fixture history authoring, test hardening, and visual polish. In-product, GPT-5.6 is called only from Next.js server routes through the Responses API and structured Zod output. It provides concise plan feedback, adaptive wording for authored hints, test-failure coaching, and evidence-grounded reflection. It receives no learner source code, diffs, or reference implementation, and deterministic tests remain authoritative.

### Submission details to complete

- **Category:** Education.
- **Key decisions and evidence:** the product boundaries and delivery order are recorded in `docs/improvement-plan.md`; the deterministic challenge validator and automated tests are the implementation evidence.
- **Codex feedback session ID:** retrieve the required ID from `/feedback` before creating the Devpost submission. Do not invent an ID or include an API key in the repository, video, or submission form.
- **Demo:** record the voiced, public video in `docs/demo-script.md` after the final local and cross-platform run-through. It should visibly show the GPT-5.6 source chip when live coaching is available, plus the authored-coaching fallback when it is not.

## Deliberate boundaries

Understudy supports one bundled TypeScript fixture repository and two curated Replay challenges. It does not offer arbitrary repositories, generated challenges, in-browser coding, accounts, cloud sync, XP, rankings, or anti-cheat.
