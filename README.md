# Understudy

**Learn from real history: Understudy drops you at the commit before a meaningful change and asks you to rebuild it yourself.**

Understudy is a local, desktop-first learning lab for developers. It gives you a copy of the bundled task-manager practice project from just before a real change landed, then asks you to rebuild the behavior in your own editor. That copy is an isolated Git worktree; Understudy calls it **your working copy**. You can also link a local npm + Vitest/Jest repository, choose one of its recent commits, and draft a replay from that history.

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

During a fixture replay, the browser never receives the reference commit ID, hidden-test paths, unrevealed hints, or reference patch before completion. After the learner passes both checks and submits the explain-back, the session becomes `completed` and the Mastery Report reveals the reference commit, changed-file list, and patch for side-by-side learning. Linked replays are deliberately different: the learner chose the commit from their own repository, so that SHA is already known to them; the linked repository's tests run locally and its reference diff is revealed only after completion. The server accepts only allowlisted scripts; browser input never reaches a shell command.

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

Codex accelerated the app's implementation, fixture history authoring, test hardening, and visual polish. In-product, GPT-5.6 is called only from Next.js server routes through the Responses API and structured Zod output. It provides concise plan feedback, adaptive wording for authored hints, test-failure coaching, the optional in-session coach, and evidence-grounded reflection. Before completion, coaching receives learner responses, test output, and session evidence but never learner source code or the reference patch. After completion, a coach exchange may include the revealed reference diff. Forge-lite variation drafting is a separate private validation flow: GPT-5.6 receives the built-in fixture reference source to propose a candidate, and the candidate is never published unless deterministic base-fails/reference-passes checks succeed. Deterministic tests remain authoritative, and authored fallbacks are used when no key is configured.

### Submission details to complete

- **Category:** Education.
- **Key decisions and evidence:** the product boundaries and delivery order are recorded in `docs/improvement-plan.md`; the deterministic challenge validator and automated tests are the implementation evidence.
- **Codex feedback session ID:** retrieve the required ID from `/feedback` before creating the Devpost submission. Do not invent an ID or include an API key in the repository, video, or submission form.
- **Demo:** record the voiced, public video in `docs/demo-script.md` after the final local and cross-platform run-through. It should visibly show the GPT-5.6 source chip when live coaching is available, plus the authored-coaching fallback when it is not.

## Deliberate boundaries

Understudy ships with one bundled TypeScript fixture repository and two curated Replay challenges. It also supports linking a local npm + Vitest/Jest repository and choosing recent commits as an early project-library path; linked challenges are user-owned and run tests on the user's machine. It does not offer accounts, cloud sync, in-browser coding, XP, rankings, or anti-cheat.
