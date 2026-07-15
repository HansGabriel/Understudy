# Understudy

**Git replay → guided practice. AI coaches, you own the code.**

Understudy is a local, desktop-first learning lab for developers. It drops a learner into a pinned commit in a bundled, versioned task-manager fixture, creates an isolated git worktree, and uses a normal suite plus a behavioral test to make overlooked edge cases visible. The fixture is intentionally supplied by Understudy because no learner repository has been connected.

## Run locally

Prerequisites: Node.js 20 or newer, npm, and Git. The project is primarily verified on Windows, but uses Node and Git argument-array processes so it is intended to run anywhere those tools are available.

```powershell
npm.cmd install
npm.cmd run fixture:build
npm.cmd run dev
```

Open `http://localhost:3000`. On PowerShell systems that block `npm.ps1`, use `npm.cmd` as shown. The app installs the bundled fixture's pinned dependencies when it creates a worktree.

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

The browser never receives reference commit IDs, hidden-test paths, unrevealed hints, or a reference patch. The server accepts only manifest-declared package scripts; browser input never reaches a shell command.

## Verification

```powershell
npm.cmd run validate:challenges
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

`validate:challenges` proves that each challenge fails at its base commit and passes at its authored reference commit; it also checks an alternate correct rollback implementation for the hero challenge.

## Build Week — Education

Understudy is prepared for the Education category: it teaches developers to reason about behavior, tests, failure modes, and independence rather than receive generated patches. See `docs/demo-script.md` and `docs/submission-checklist.md` for the planned submission materials.

### How Codex and GPT-5.6 are used

Codex accelerated the app's implementation, fixture history authoring, test hardening, and visual polish. In-product, GPT-5.6 is called only from Next.js server routes through the Responses API and structured Zod output. It provides concise plan feedback, adaptive wording for authored hints, test-failure coaching, and evidence-grounded reflection. It receives no learner source code, diffs, or reference implementation, and deterministic tests remain authoritative.

## Deliberate boundaries

Understudy supports one bundled TypeScript fixture repository and two curated Replay challenges. It does not offer arbitrary repositories, generated challenges, in-browser coding, accounts, cloud sync, XP, rankings, or anti-cheat.
