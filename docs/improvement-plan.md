# Understudy — Improvement Plan

Written July 16, 2026. Deadline: **July 21, 5:00 PM PT** (OpenAI Build Week, Education).
Goal of this plan: fix what's broken, make the product understandable to a first-time user, protect the demo, and leave clean seams for post-hackathon extension — in that order.

---

## Phase 0 — Stabilize (July 16–17) · *fix what the review confirmed*

These came out of a verified multi-agent code review of the current staged changes. All were confirmed against the code. Do these before anything else — two of them can destroy learner data, one breaks the judges' showcase page.

| # | Fix | Where | Why it's first |
|---|-----|-------|----------------|
| 0.1 | Only auto-discard stale sessions in `planning`/`coding` status — never `passed`. If a passed session exists, return 409 + its sessionId so the client offers "Resume or discard?" | `app/api/sessions/route.ts` | One click on "Start replay" currently deletes a passed session (worktree, attempts, evidence) with no confirmation |
| 0.2 | `discardSession` must re-load and re-check status **inside** `withSessionLock` before deleting (accept an `onlyIfStatus` predicate) | `lib/session-cleanup.ts` | Check-then-act race can delete a session that completed while the discard was queued; the window is seconds wide because explain-back awaits an AI call while holding the lock |
| 0.3 | Cleanup failures must not block session creation — log and skip on discard errors instead of rethrowing | `app/api/sessions/route.ts` | A locked file in an old worktree (common on Windows) currently 500s the whole "start replay" action |
| 0.4 | Add `referenceDiff` to the sample fixture + sample-session route + schema so `/report/sample` renders the reference-reveal panel | `app/api/sample-session/route.ts`, `fixtures/sample-session.json`, `lib/schemas.ts` | The page built for judges never shows the flagship feature |
| 0.5 | Add a `.catch` fallback to the `referenceDiff()` call (mirror `diffDetails`) so a missing fixture degrades the panel, not the whole report | `app/api/sessions/[id]/route.ts` | A completed Mastery Report should never 500 |
| 0.6 | Fix the inert `vi.mock("@/lib/git")` (challenges.ts imports from `@/lib/fixture`); add a test asserting passed sessions are never auto-discarded | `tests/challenges.test.ts` | Locks in 0.1 so it can't regress |

**Acceptance:** `npm run test`, `npm run lint`, `npm run validate:challenges` all pass; manually verify: start replay twice on the same challenge with a passed session → prompted, not deleted; `/report/sample` shows the reference comparison.

---

## Phase 1 — Clarity (July 17–18) · *make it usable*

The product currently explains itself in implementation language. These are copy and small-UI changes only — no architecture.

**1.1 — "How this works" strip** on the library page (3 steps):
1. *Pick a real change from this project's history.*
2. *We give you a copy of the project from just before it landed — open it in your own editor.*
3. *Come back here to run checks, get coached, and prove your change works.*

Plus one sentence under the project box: *"Understudy is the coach. task-manager is the project you're improving, in a copy on your own disk."*

**1.2 — Terminology pass** across library / session / report screens. Learner-facing word first; keep the technical term as a small mono subtitle where the engineering-pad aesthetic wants it:
- "curated local fixture" → **practice project**
- "worktree" → **your working copy**
- "normal suite" → **the project's own tests**
- "behavioral test" → **the edge-case check**
- "replay" → keep, but always introduced as "rebuild a real change from this project's history"

**1.3 — Rewrite both challenge briefs** user-outcome first, honest about the headless fixture:
- Lead: *"You're building the data layer of a task-manager app."*
- Then the user story: what should happen immediately, what must happen when the save fails, why the user cares.
- Then acceptance criteria (current content, mostly fine).
- Do **not** invent UI that doesn't exist (no "checkbox" language — the fixture is a TypeScript library with tests, and the copy must not promise a screen).

**1.4 — Honest project selector.** Keep "Load a different project" visible but disabled, with copy: *"This MVP ships one practice project. Adding your own repository is next on the roadmap."* This converts the #1 user confusion into a roadmap statement.

**1.5 — Library page header** gets the one-liner from the design sheet, verbatim: *"Learn from real history: Understudy drops you at the commit before a meaningful change and asks you to rebuild it yourself."*

**Acceptance:** someone who has never seen the app can read the library page and answer: what am I editing, where, with what editor, and how do I know I'm done. Test this on one real person.

---

## Phase 2 — Judge experience & submission (July 18–20)

**2.1 — Cross-platform verification.** Run the full loop (install → fixture:build → dev → complete the hero challenge → report) on macOS or Linux. Fix only what breaks. This is the single most likely "it didn't run for the judge" failure.

**2.2 — First-run hardening.** Missing fixture → styled, actionable error (never a stack trace). README states how long `fixture:build` takes and what success looks like. Troubleshooting section: PowerShell npm.ps1 blocking, Node < 20, missing git.

**2.3 — README submission section.** Honest account of how Codex and GPT-5.6 were used (Codex for implementation; GPT-5.6 in-product for coaching via Responses API), where key decisions were made, Codex session ID. The GPT-5.6 source chips in the UI make the in-product usage provable on camera.

**2.4 — Demo video** (< 3 min, public YouTube) following `docs/demo-script.md`. Must show: the amber signal moment, one live GPT-5.6 coaching beat, the Mastery Report, and the post-completion reference reveal as the closing beat.

**2.5 — Repo hygiene.** Commit in meaningful increments from now on (history is evidence of Build Week work). Rotate the OpenAI key in `.env.local` before the repo goes public. Verify `.env.local` is not in any commit.

**Do NOT in this phase:** author a third challenge, build project import, add AI Forge, add accounts/XP/leaderboards. One roadmap slide covers all of it.

---

## Phase 3 — Extensibility seams (only if time remains before July 21; otherwise first thing after)

Cheap structural changes that make future extension additive instead of a rewrite. None of these add features.

- **3.1 — Single projection helper.** Move the status-gated reference-reveal logic into one `toPublicSession(session, challenge)` in `lib/challenges.ts` that every route funnels through. Today the gate lives inline in one route handler; any future route must remember to re-implement it.
- **3.2 — One npm-resolution module.** `lib/test-runner.ts` and `scripts/npm-runner.mjs` carry byte-identical copies of the npm-cli discovery logic. Extract one shared `.mjs` both import.
- **3.3 — Drop the dead `source` field** on timeline events (written by 4 routes, read by nothing — provenance already lives on the per-field `aiSource` values).
- **3.4 — Memoize `listChallenges()`** at module scope (static data; currently re-read and re-validated twice per session GET).
- **3.5 — Project-aware manifests (schema only).** Add an optional `projectId: "task-manager"` field to the challenge manifest schema, defaulted when absent. Zero behavior change now; makes the Phase-4 project library a data migration instead of a schema break.

---

## Phase 4 — Post-hackathon roadmap (the "extendable for future use" part)

In order of leverage, each building on the last:

1. **Project library.** `projects/<id>/{repository, challenges}` layout; sidebar becomes a real selector; `task-manager` becomes the built-in example. All current session/replay machinery is reused per-project — this is why 3.5 matters.
2. **Challenge authoring kit.** A CLI (`understudy author`) that walks a maintainer through: pick base + reference commits → write brief/hints/explain-back → generate the manifest → run the existing validator (fails at base, passes at reference, passes an alternate implementation). The validator already exists; the kit packages it.
3. **Commit discovery.** Scan a repo's history and *suggest* replay candidates (small, well-tested, single-purpose commits). Suggestion only — authoring stays human + validated.
4. **Fixture with a real UI.** Re-author the bundled fixture as a tiny web app so briefs can show actual screens and UI-flavored challenges become possible. (Deliberately rejected pre-deadline: requires regenerating fixture history and re-validating everything.)
5. **AI Forge.** Generate novel challenges, validated the same way (private reference attempt must pass the hidden tests before a challenge is published). Kept out of the MVP on purpose; the validation pipeline from #2 is the prerequisite.
6. **Multi-language runners.** Adapter interface over `lib/test-runner.ts` (npm/Vitest today; pytest, go test later). The manifest already declares its commands, so this is mostly runner plumbing.

---

## Standing rules (apply to every phase)

- Deterministic tests stay authoritative; the AI coaches, never grades and never writes learner code.
- The reference stays private until `completed`, then is revealed for learning — enforce in one shared projection (3.1), test it.
- No shell-string execution anywhere; `execFile` argument arrays only; manifest-declared scripts only.
- Every scope cut is stated in the UI or README as a roadmap item, not hidden. Honest boundaries read as discipline, not absence.
