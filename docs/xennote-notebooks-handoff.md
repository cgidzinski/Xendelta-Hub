# XenNote notebooks: handoff

Notebooks are becoming OneNote/Obsidian/Logseq-style: notebook → sections → pages (one level of sub-pages), a block
editor, `[[links]]`, backlinks, tags, search, then sharing, a graph, a journal, and more. Four phases are built and open
as pull requests; the rest are planned. This is everything needed to carry on without the original session.

**The plan is GitHub issue #448.** Read it first: it has the decisions table, every phase with checkboxes, the risks and
the technical outline. This file is the context the issue does not have. The agreed designs are in
[`docs/xennote-mocks/`](xennote-mocks/index.html) (open `index.html` in a browser).

## State

Nothing is merged yet. The pull requests are **stacked**: each targets the previous phase's branch, so every diff is one
phase. Merge them in this order (GitHub retargets each one as the one below it merges).

| Order | PR | Branch | What |
|---|---|---|---|
| 1 | #450 | `ccr-43d3cb3e-unth1f` | Phase 1: shared page schema, converters, models, dependencies |
| 2 | #451 | `ccr-43d3cb3e-unth1f-phase2` | Phase 2: sections and pages API, access, files, trash, realtime |
| 3 | #452 | `ccr-43d3cb3e-unth1f-phase3` | Phase 3: notebook screen and page editor (opt-in) |
| 4 | #454 | `ccr-43d3cb3e-unth1f-phase4` | Phase 4: links, backlinks, tags, search, side panel |

All four pass `format:check`, `lint`, `type-check`, `test` and `build`, and `npm audit --omit=dev --audit-level=high`.
Phases 3 and 4 were also driven in a real browser (see "Running it"). The new screens are **opt-in**: open XenNote with
`?pages=on` (remembered per browser). Existing notebooks open empty in that view until the migration (Phase 6) converts
them. Nothing the old notebooks do has changed.

This handoff file and the mocks are on the Phase 4 branch.

## What to do next

Continue from **Phase 5** in the issue (sharing, public pages, a "Shared with me" area, share notifications). Then phases
6 to 13 in order; Phase 6 is the cutover release (migration), and Phase 13 can ship any time
after phases 3 and 4. Phase 5 starts with **mocks**: the repo's rule (CLAUDE.md, "Adding a sub-app") is to mock new main
screens before building. Add the new mocks to `docs/xennote-mocks/` in the same plain-HTML form, and get them agreed.

Things deliberately deferred, all listed in the issue: **subscriptions and digests** (subscribe to a page, section or
notebook and get changes gathered into one update; it has its own deferred section on the issue and is to be built later,
not in Phase 5), block drag handles and drag-to-reorder (they wait for the live
co-editing project because TipTap's drag-handle package needs the collaboration packages as peers), page reminders (need
the reminder job generalised, Phase 6), inline PDF preview, moving a page to another notebook, and cleaning up files that
were uploaded but never used in a saved page.

Open questions for the person who owns the product:
- Subscriptions (deferred, but decide before building): each has its own digest interval (hourly, daily or weekly). It was
  written as "a different time per subscription" and read as an interval. If a time of day was meant ("send this one at
  9am"), that also needs the user's time zone.
- Phone behaviour was only checked in desktop Chromium at phone size. It needs a real iPhone before the cutover.

## How the work is organised

- One branch and one PR per phase, named `ccr-43d3cb3e-unth1f-phaseN`, each **based on the previous phase's branch**. Open
  the PR against that branch, not `main`. Mention `#448` in the PR body (use "Part of #448", not "Closes").
- Tick the checkboxes on issue #448 as work is done and put the PR number on the phase's line. In the GitHub web UI you can
  tick boxes directly. If you edit through an API that replaces the whole body, send the whole body.
- Update `src/shared/appGuide.ts` `features` and `tips` in the same PR as any feature a user can actually use. While the
  notebook view is behind `?pages=on` nothing is user-visible, so the guide is updated at the cutover (Phase 6).
- Read `CLAUDE.md` and `src/client/components/ui/DESIGN.md` before changing anything. The ones that bit during this work:
  theme tokens only (no hex or `rgba()` literals, `designLint.test.ts` fails on them); reuse `PageHeader`, `EmptyState`,
  `ListSkeleton`, `ResponsiveDialog`, `Banner`, `useConfirm`; every route validates input (`validationCoverage.test.ts`);
  throw `AppError`; `npm run format` before committing; never drop the 4th parameter of an Express error handler.
- Dependencies: follow the lockfile procedure in `CLAUDE.md` (edit `package.json`, delete `node_modules`,
  `npm install --package-lock-only --ignore-scripts`, then `npm ci`). Never `npm update` or `npm audit fix`.
- **Never run a branch that contains an unmerged migration against staging or production.** Starting the server runs pending
  migrations. Phase 6 adds the big one; rehearse it on a restored copy (`npm run db:export`), see `migrations/README.md`.

## Where things are

| Area | Files |
|---|---|
| Page body format (TipTap/ProseMirror JSON), limits | `src/shared/xennote/pageSchema.ts`, `pages.ts` |
| What is derived from a body (links, tags, files, search text, to-do counts) | `src/shared/xennote/deriveFromDoc.ts` |
| Converters (notes ↔ Markdown ↔ page), frozen for the migration | `src/shared/xennote/convert/v1/` |
| "Link it" (turn a plain mention into a link) | `src/shared/xennote/linkMention.ts` |
| Models: section, page, body, version | `src/server/models/xenNotePage.ts` (notebook fields in `xenNote.ts`) |
| Who may do what with a page | `src/server/utils/xenNotePages.ts` (`pageRole`), `routes/xennote/pageAccess.ts` (`loadPage`, `loadSection`) |
| The one body-save pipeline | `writePageBody` in `src/server/utils/xenNotePages.ts` |
| One visibility filter for every page lookup | `src/server/utils/xenNotePageSearch.ts` (`visiblePagesFilter`, `searchPages`) |
| Routes | `src/server/routes/xennote/`: `sections.ts`, `pages.ts`, `pageSharing.ts`, `pageFiles.ts`, `pageTrash.ts`, `pageLinks.ts`, `pageSearch.ts` (registered in `index.ts`; literal paths before `:id`) |
| Ordering | `src/server/utils/xenNoteOrder.ts` (fractional keys) |
| Realtime events | `src/shared/realtime.ts`, `SocketManager.ts`: `xennote:notebook_update`, `xennote:page_update` |
| Server tests | `src/server/routes/xennotePages.test.ts`, `xennotePageLinks.test.ts` (access matrix) |
| Client data layer | `src/client/hooks/xennote/usePages.ts`, `keys.ts`, `useNotebookPagesFlag.ts`, `src/client/types/XenNotePage.ts` |
| Notebook screen | `src/client/routes/Internal/XenNote/notebook/` (`NotebookView`, `PageView`, `PageList`, `SectionTabs`, `TagPage`, `NotebookSearch`, `PageReferences`) |
| Editor | `src/client/routes/Internal/XenNote/editor/` (`PageEditor`, `nodeViews`, `SlashCommand`, `LinkSuggestions`, `usePageDraft`, `pageDraft.ts` state machine) |

The old notes board is untouched: `XenNote.tsx` and `components/`. Loose notes stay as they are until Phase 13.

## Gotchas found the hard way

Each of these cost time; they are not obvious from the code.

- **`validate()` does not replace `req.body`.** It only checks. Handlers re-parse (`schema.parse(req.body)`) to get trimmed and
  defaulted values. Same for `validateQuery`.
- **Mongoose stores `undefined` as `null`** inside Mixed fields. Page bodies go through `JSON.parse(JSON.stringify(...))`
  before saving. Drop keys instead of setting them to `undefined`.
- **Soft-deleted rows** are hidden by a plugin. To touch them use `.setOptions({ includeDeleted: true })` on the query
  (it is not accepted as an update option).
- **TipTap `configure()` deep-copies plain objects**, so a `{ current }` ref passed as an option is cloned and the plugin reads a
  copy. Pass functions that read the ref instead (see `SlashCommand.ts`).
- **`editor.setEditable(x)` emits an update event by default.** The autosave takes that for typing. It must be
  `setEditable(x, false)`, and only when the value changed. This once made every page open save itself.
- **The page query uses `gcTime: 0` on purpose** (`useXenNotePage`): the editor starts from that data and saves against its
  revision, so it must never start from a copy kept from an earlier visit.
- **Menus that open under the mouse** must react to `mousemove`, not `mouseenter`, or a resting pointer takes the selection.
- **React keys for suggestion rows** must be the page id, not the title (same-named pages exist).
- **Each editor sends a random `client_id`** with its saves and the server echoes it in `xennote:page_update`. Ignoring events
  by user id instead would hide the same person's other tab or phone.
- **The server's TypeScript config has no DOM lib.** Code in `src/shared` that the server compiles cannot use DOM types.
- **`fractional-indexing` is ESM-only.** It loads fine under `tsx` on Node 22 (what CI and production use).
- Page links store the page **id**; the title in the link is only what was typed. A page you cannot open and an id that is no page
  at all must answer identically (locked), so ids cannot be probed.
- Page files are only kept in a body if they were uploaded to that page (`sanitizePageDoc`); public links must sign only
  `page.files`.

## Running it and checking it in a browser

Tests alone did not catch several real bugs (the list above has them). Run the app and use it.

```bash
# 1. An in-memory MongoDB (mongodb-memory-server is already a dev dependency)
cat > /tmp/mongo.cjs <<'JS'
const { MongoMemoryServer } = require("mongodb-memory-server");
(async () => {
  const m = await MongoMemoryServer.create({ instance: { port: 27555 } });
  console.log("mongo", m.getUri());
  setInterval(() => {}, 1 << 30);
})();
JS
NODE_PATH=$PWD/node_modules node /tmp/mongo.cjs &

# 2. The real server, with files kept in memory (no storage account needed)
MONGODB_URI="mongodb://127.0.0.1:27555/xendelta" JWT_SECRET=local-test-secret-local-test-secret \
  STORAGE_DRIVER=memory PORT=3011 NODE_ENV=development PUBLIC_URL=http://localhost:3011 \
  npx tsx src/server/server.ts &

# 3. A user
curl -s -X POST localhost:3011/api/auth/signup -H 'content-type: application/json' \
  -d '{"username":"me","email":"me@example.com","password":"Passw0rd!Passw0rd","confirmPassword":"Passw0rd!Passw0rd"}'
```

Drive it with Playwright (install it if it is not already available). The app reads its sign-in token from
`localStorage.token`; set `localStorage.xennote_pages = "true"` to get the notebook view. A minimal session:

```js
const { chromium } = require("playwright");
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // and 390x844 for a phone
await ctx.addInitScript((t) => { localStorage.setItem("token", t); localStorage.setItem("xennote_pages", "true"); }, TOKEN);
const page = await ctx.newPage();
await page.goto("http://localhost:3011/internal/xennote");
```

Create notebooks, sections and pages through `/api/xennote/...` (see the flow tests for the shapes), then check the screen.
Take screenshots and look at them. Test **two tabs** on one page, a **second user** who must not see things, and a **phone
size**. The in-memory storage driver returns fake signed URLs, so pictures show as broken images; that is expected there.
Stop the server and Mongo when done (`lsof -ti:3011 -sTCP:LISTEN | xargs -r kill`).

## Before every pull request

`npm run format:check`, `npm run lint`, `npm run type-check`, `npm test`, `npm run build`,
`npm audit --omit=dev --audit-level=high`. CI runs all of them. Existing lint warnings (about 31) are not yours; add none.

## Prompt for the LLM

Paste this as the first message:

> You are continuing a multi-phase feature in this repository: XenNote notebooks become sections and pages with a block
> editor, links, tags and search, then sharing, a graph, a journal and more. Read these before doing anything, in order:
> 1. `CLAUDE.md` and `src/client/components/ui/DESIGN.md` (rules you must follow).
> 2. `docs/xennote-notebooks-handoff.md` (state, workflow, file map, gotchas, how to run and test).
> 3. GitHub issue #448 (the plan: decisions, phases, checkboxes, risks).
> 4. The design mocks in `docs/xennote-mocks/index.html`.
>
> Phases 1 to 4 are built and open as stacked pull requests #450, #451, #452, #454 (merge in that order). Continue with
> Phase 5 from the issue. Start by making mocks for the new screens (add them to `docs/xennote-mocks/`) and show them for
> agreement before writing the feature. Work one phase per branch, named `ccr-43d3cb3e-unth1f-phaseN`, based on the previous
> phase's branch, and open each PR against that branch with "Part of #448". Tick the issue's checkboxes and add the PR number
> to the phase line as you go. Run the app and test it in a real browser (desktop, phone size, two tabs, a second user), not
> only the test suite; the handoff file explains how. Do not run a branch containing an unmerged migration against staging or
> production. If something in the plan is unclear or you want to deviate, say so in the PR and on the issue rather than
> silently changing it.
