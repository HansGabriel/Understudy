# Understudy

**Git replay → guided practice. AI coaches, you own the code.**

Understudy is a local, desktop-first learning lab for developers. It drops a learner into a pinned commit in a bundled, versioned task-manager fixture, creates an isolated git worktree, and uses a normal suite plus a behavioral test to make overlooked edge cases visible. The fixture is intentionally supplied by Understudy because no learner repository has been connected.

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

1. Pick a curated task-manager change from the practice library.
2. Answer three planning questions before editing.
3. Open the isolated worktree in your own editor.
4. Run the normal suite and a behavioral test. A green normal suite plus an amber behavioral failure is the intended signal, not a setup error.
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

## Deliberate boundaries

Understudy supports one bundled TypeScript fixture repository and two curated Replay challenges. It does not offer arbitrary repositories, generated challenges, in-browser coding, accounts, cloud sync, XP, rankings, or anti-cheat.
