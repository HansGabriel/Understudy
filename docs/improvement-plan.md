# Understudy — Improvement Plan

Written July 16, 2026. Deadline: **July 21, 5:00 PM PT** (OpenAI Build Week, Education).
Goal of this plan: fix what's broken, make the product understandable to a first-time user, protect the demo, and leave clean seams for post-hackathon extension — in that order.

---

## Phase 5 — "Make it a dojo, not a dashboard" (July 17–19 UX/AI overhaul)

User verdict after real use: bland, wordy, hard to grasp at a glance; linked-project tasks read as raw commits; AI coaching too thin to feel useful. Reference points: Codewars/LeetCode task presentation — a *puzzle you want to open*, not a system that explains itself. Three principles: **show the task, not the machinery; use the palette we already have; let the AI say something substantive within the pedagogy.**

### 5A — Visual system pass (color + hierarchy, no layout rebuild)

The "Engineering Pad" palette (Graphite/Pad/Pass green/Fail red/Signal amber/Cobalt) exists in `globals.css` but the UI reads monochrome cream. Deploy it:

- **Difficulty as color**, Codewars-style: 1–2 = Pass-green chip, 3 = Signal-amber chip, 4–5 = Fail-red chip, with the dots inside the chip. One `difficulty-chip` class, used on cards + session brief + report.
- **Tag chips get soft tinted backgrounds** (3–4 tint variants derived from Cobalt/Signal/Pass at ~12% alpha, assigned by hash of tag text) instead of uniform gray.
- **State color-coding everywhere a state exists**: card left-border / status chip — completed = Pass green, in-progress = Cobalt, passed-awaiting-explain = Signal amber. The report's signal panels already do this; generalize it.
- **One accent action per screen**: primary CTA solid Cobalt ("Start replay", "Run checks", "Send plan to coach"); everything else secondary/quiet. Today several same-weight buttons compete.
- **Cut visible prose ~50% on library/session**: headline stays; the paragraph under it moves into a dismissible first-run callout. Sidebar explainer sentences shrink to one line. Eyebrow labels max 2–3 words ("THE BEHAVIOR YOU'RE REBUILDING" → "YOUR TASK").
- **Type scale contrast**: card titles up (20→24px display), meta text down; more whitespace inside cards, tighter between sections.

### 5B — Task presentation: kata cards, not commits

The commit picker is the weakest screen: raw `git log` + "Create replay". The AI drafting already exists — move it BEFORE the user sees the list:

- **Task board replaces commit list.** On picker load, auto-draft kata-style cards for the ~6 most promising commits (test-adding first, then feat/fix by diff size) using the existing `draftChallengeFromCommit`, cached per sha (extend the existing validation cache). Card = generated title in plain words (NOT the commit subject), one-line story, difficulty chip, tags, est. time; the sha/commit subject demoted to small mono metadata.
- **Kata-style brief structure** everywhere (fixture + linked + variations): `story` (2–3 sentences, plain words, no jargon), `task` ("Your task: …" imperative), `requirements` (checkable list = acceptance criteria), `example` (a short before/after behavior example, text or tiny table — NOT solution code). Extend the brief schema with optional `story`/`example`; drafting + fixture manifests populate them; session brief card renders Story → Your task → Requirements → Example like a Codewars kata description.
- **"Draft with AI" affordances**: each task card gets "Regenerate" (re-draft with a fresh angle) and the board gets a free-text input — "What do you want to practice?" — that steers drafting (bias commit selection + brief emphasis toward the topic). Both reuse `draftChallengeFromCommit` with a `guidance` parameter.
- **Raw mode stays** behind a small "Browse raw commits" toggle for transparency.

### 5C — AI depth: substantive within the pedagogy

Keep the hard rules (no full solutions pre-completion, tests authoritative, escalation tiers). Loosen the muzzle:

- **Plan feedback → structured per-answer response**: for each of the 3 answers, one-line strength or gap; then ONE sharpening question. Rendered as a 3-row checklist + highlighted question, not a paragraph. Raise the response budget (900 → ~1600 chars) and update the accept validator accordingly.
- **Approach outline (opt-in, logged)**: after plan confirm, a "Suggest an approach outline" button → AI returns 3–5 high-level steps (no code, no file paths at L1-equivalence), rendered as a visual numbered stepper. Recorded like a hint (its own Independence row: "outline used"). This is the user's "visualize the plan" ask, scoped sanely.
- **Hints get structure**: each level returns `{concept, lookAt, testIdea}` — L1 fills only `concept`, L2 adds `lookAt` (area, not file/line), L3 adds all three with file-level pointer. Rendered as labeled mini-sections instead of one sentence.
- **Failure coaching**: always concretely states expected vs observed from the test output, then one investigation question. Two short paragraphs max.
- **Coach**: raise reply budget, allow structured replies (short lists OK) within existing tier gates; system prompt: "be specific and useful at the current tier — vague encouragement is a failure mode."
- **Reflection/report**: 3 bullet observations tied to timeline evidence (what the first attempt missed, what closed it, what to practice next) instead of one abstract paragraph.
- **Forge takes a prompt**: the variation card's input accepts "describe the task you want" and passes it as guidance to `draftVariation` (validation gate unchanged).

### Sequencing & scope guards

Order: approved P0 fixes → 5A (half day, pure CSS/copy) → 5B (the big one, ~1 day) → 5C (half day, prompts/schemas/rendering). Feature-freeze Sunday night regardless; film Monday. Do NOT: rebuild layout/navigation, add syntax-highlighted code panes, in-browser editors, mermaid/diagram engines, or per-language kata categories. If time runs short, 5B's auto-drafted task board is the highest-value single change — it fixes complaint #2 and demos as the "wow" moment.

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

## Phase 1.5 — Round-2 feedback (July 16 user testing) · *quick wins only*

From first real walkthrough of the full loop. Split into now vs roadmap:

**Do before the deadline (small, high-visibility):**
- **1.5a — Completion state on challenge cards.** The library gives no signal that a challenge was already completed. Use the existing sessions data: completed → "Completed ✓ · View report" (link), passed-in-progress → "Resume session". Removes the "no idea if I already completed the task" confusion.
- **1.5b — Delete from the report.** A completed session currently can't be discarded from its report page. Add a quiet "Delete this session" (confirm-gated) next to "Practice again", reusing the existing DELETE route.
- **1.5c — Make plan coaching visible.** GPT-5.6 plan feedback already exists but reads as a footnote under the submit button, so it feels like "input with no feedback." Render the coach's question as a prominent card after submitting, and allow one optional revision of the plan answers before the worktree opens. One round, not a chat.
- **1.5d — Demo-readability density pass.** Trim copy so every screen is scannable in a 3-minute video: shorter card text, collapse "How this works" once a session exists, keep the signal callout and report as the visual anchors. Copy cuts only — no layout restructuring this close to the deadline.

**Explicitly rejected (and why):**
- **Free-form AI chat during a session.** The design sheet's stance — "a rationed resource, not a chat window" — is the product's differentiator and what makes the independence signal honest. The fix for "I got no feedback" is 1.5c (make existing coaching visible), not a chat box.
- **Task regeneration, richer UI-task media, project import.** All real, all Phase 4 (items 1–5 below). Regeneration is AI Forge; UI screenshots need the fixture-with-a-UI; import is the project library.

---

## Phase 1.75 — Coach panel (OPTIONAL pre-deadline; build ONLY after the demo video script and the macOS/Linux run-through are done)

An in-session conversational coach — a teacher, not an answer machine. This is an *extension of the hint ladder*, not a free chat. Three facts make it safe and cheap: the model never receives the reference patch (it cannot leak the solution), the guardrail pattern in `lib/ai.ts` (structured output + accept validators + authored fallbacks) extends directly, and every exchange is logged into the Independence signal.

**Server:**
- New route `POST /api/sessions/[id]/coach` with `{ message: string }` (Zod: trim, min 3, max 600).
- New `coachMessage()` in `lib/ai.ts`, same pattern as the four existing coaching functions: Responses API, structured Zod output, 8s timeout, authored fallback, `accept` validator.
- Grounding context (and nothing more): challenge brief, plan answers, revealed hints, latest attempt's test-output summary, session status, and the thread so far. **Never learner source code, never the reference commit/patch** — same boundary as today, restated in the system prompt.
- **Escalation policy enforced in the prompt AND the accept validator** (defense in depth, mirroring plan/confirm):
  - Always allowed: concepts, questions back, restating what the failing check observed.
  - Pseudocode: only if hint L2 is revealed OR ≥2 failed verify attempts.
  - Partial solution shape (a few lines, never a full patch): only if hint L3 is revealed.
  - After `completed`: unrestricted — the reference is already revealed; the coach may discuss it (pass the reference diff into context ONLY in this state).
  - Accept validator: pre-completion, reject responses containing code fences over 5 lines, full function bodies, or file-path + line prescriptions (reuse/extend `isSafeCoachingText`).
- **Rationing:** cap the thread at 12 learner messages per session; the UI shows "coach messages: N of 12". Keeps it a deliberate resource, consistent with the product thesis.
- Schema: `coachThread: z.array(z.object({ role: z.enum(["learner","coach"]), text, at, source: coachingSourceSchema.optional() })).default([])` on the session record; timeline event type `"coach"` per exchange.
- No API key → authored fallback: "The coach needs an OPENAI_API_KEY. The hint ladder still works fully."

**UI:**
- "Coach" card in the session right column beneath the HintPanel: thread, input, send; header states the contract — "Guides your thinking. Never writes your patch. Every message is part of your report."
- Report: Independence panel gains a "coach messages" row; the timeline shows coach beats.

**Tests:** schema round-trip with a thread; escalation gating (pseudocode blocked before L2, allowed after); message cap enforced; public projection still leaks nothing pre-completion; accept-validator rejection falls back to authored text.

**Demo value:** this is the most visible GPT-5.6 surface in the product — show one exchange in the video where the coach asks a question back instead of answering.

---

## Phase 4 — Post-hackathon roadmap (the "extendable for future use" part)

In order of leverage, each building on the last:

1. **Bring-your-own-repo replay (project library + import).** The detailed spec:
   - **Registry:** `runtime/projects.json` (or `projects/<id>/config.json`): id, display name, mode `linked` (absolute path to a local repo) or `cloned` (git URL cloned under `runtime/projects/<id>`), detected package manager + test command from `package.json`. Reuse `assertInside`-style path guards; `projectId` threads through paths (the Phase 3.5 seam) so `task-manager` becomes just the built-in project.
   - **v1 support gate:** git repo + npm + Vitest/Jest detected, else a friendly "not yet supported" card. State it in the UI.
   - **Commit picker — prioritize self-validating commits.** Scan recent history for commits that ADD test files: run the added tests against the parent commit — if they fail there and pass at the commit, the challenge validates itself (fail-at-base / pass-at-reference, computed automatically). List those first as "replayable"; other commits get a "no automatic edge-case check" badge and use the repo's whole suite as the only check.
   - **AI drafting (GPT-5.6):** generate brief, 3 plan questions, 3 leveled hints, explain-back question from the commit message + diff stat (NOT the full patch — keep the reveal meaningful). Manifest saved per-project; user can edit before first use. Badge AI-drafted challenges as such.
   - **Safety:** running an imported repo's tests executes that repo's code — require an explicit one-time consent notice per project; keep `--ignore-scripts` installs and the script allowlist pattern.
   - **Reuse everything:** sessions, worktrees, hint ladder, coach, report, reveal — all existing machinery, keyed by projectId.
2. **Task generation ("Forge-lite", builds on #1's validator).** Two tiers:
   - **Variations:** GPT-5.6 proposes a variation of an existing validated challenge (e.g. rollback → retry-with-backoff). A private validation run must produce a reference implementation that passes a generated behavioral test which fails at base — only then is the challenge published to the library. No validation pass → never shown.
   - **From-scratch generation** stays behind the same gate. The gate is the feature; an unvalidated generated task is worse than no task.
3. **Challenge authoring kit.** A CLI (`understudy author`) packaging the existing validator (fails at base, passes at reference, passes an alternate implementation) for human authors.
4. **Fixture with a real UI.** Re-author the bundled fixture as a tiny web app so briefs can show actual screens and UI-flavored challenges become possible. (Deliberately rejected pre-deadline: requires regenerating fixture history and re-validating everything.)
5. **Multi-language runners.** Adapter interface over `lib/test-runner.ts` (npm/Vitest today; pytest, go test later). The manifest already declares its commands, so this is mostly runner plumbing.

---

## Standing rules (apply to every phase)

- Deterministic tests stay authoritative; the AI coaches, never grades and never writes learner code.
- The reference stays private until `completed`, then is revealed for learning — enforce in one shared projection (3.1), test it.
- No shell-string execution anywhere; `execFile` argument arrays only; manifest-declared scripts only.
- Every scope cut is stated in the UI or README as a roadmap item, not hidden. Honest boundaries read as discipline, not absence.
