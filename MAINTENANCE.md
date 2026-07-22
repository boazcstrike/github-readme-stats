# Fork Maintenance & Context

> Context notes for maintainers and future agents working on `boazcstrike/github-readme-stats`.
> Keep this file updated when syncing, auditing, or making structural decisions.

## What this repo is

A personal fork of the GitHub Readme Stats project. Its history and current sync
state are documented below so nobody has to re-derive them.

## Upstream lineage (important)

| Repo | Role | Default branch | Status |
|------|------|----------------|--------|
| `anuraghazra/github-readme-stats` | Original project | `master` | **DEPRECATED / unmaintained** |
| `stats-organization/github-stats-extended` | Successor (active fork) | `master` | **Active** — track this |
| `stats-organization/github-readme-stats-action` | GitHub Action variant | `main` | Alternative usage method |

- The original `anuraghazra/github-readme-stats` added a **deprecation notice** (commit `54a7985`, 2026-06-30)
  directing users to **GitHub Stats Extended**, "an actively maintained fork with additional
  features and improved stability."
- **This fork now tracks `github-stats-extended`.** That is the source of truth for future syncs.

## Sync history

1. Fork's `main` was originally a single squashed "Initial commit" — an old snapshot with
   **no shared git history** with upstream (not a real GitHub fork; parent was null).
2. Merged `anuraghazra/github-readme-stats@master` in via `--allow-unrelated-histories -X theirs`,
   then removed 24 stale pre-restructure files so the tree matched upstream exactly.
3. Discovered upstream is deprecated → merged the successor
   `stats-organization/github-stats-extended@master` into `main`. HEAD content now equals
   `extended/master`. Only conflict was the README (took extended's `readme.md`).

### Architecture note

`github-stats-extended` **restructured the project into a pnpm + turbo monorepo** (the old
single-package layout is gone). Workspaces:

| Path | Package | Runtime deps |
|------|---------|--------------|
| `apps/backend` | serverless API | `axios`, `pg` (Postgres), core |
| `apps/frontend` | React 19 web UI | react, redux, axios, daisyui, save-svg-as-png, uuid |
| `packages/core` | card rendering / fetchers | axios, emoji-name-map, github-username-regex |

Tooling: pnpm (`pnpm-lock.yaml`), turbo, vitest, playwright, eslint 9, knip.
Package manager is **pnpm**, not npm — use `pnpm install`, `pnpm audit`, `pnpm -w run <script>`.

## Git remotes (local clone)

```
origin    -> boazcstrike/github-readme-stats        (this fork)
upstream  -> anuraghazra/github-readme-stats        (deprecated original)
extended  -> stats-organization/github-stats-extended (active successor — sync from here)
```

## How to sync future changes (from the active successor)

```bash
git fetch extended
git merge extended/master        # or: git rebase extended/master
# resolve conflicts (README/config), then:
git push origin main
```

## Deployment (READ BEFORE REDEPLOYING) ⚠️

**This profile's stats card is served from `github-readme-stats-boazcstrike.vercel.app`
(a self-hosted Vercel deployment of this repo).** The successor restructured the project, so
the old Vercel setup **will not build the new tree as-is**:

- Old repo: simple `api/index.js` serverless function, zero-config Vercel preset.
- New repo (`github-stats-extended`): **pnpm + turbo monorepo** using the **Vercel Build
  Output API v3**. The backend lives in `apps/backend/` with its own `apps/backend/vercel.json`
  (custom `buildCommand` + `vercel-preparation.sh` assembling `.vercel/output`). A **single
  `api.func`** serves all routes via `apps/backend/router.js`.
- New runtime dependency: **`pg` (Postgres)** — used for the OAuth per-user token feature
  (`getUserPat` → DB lookup). Basic env-PAT stats cards still work, but DB code paths expect a
  database to be configured.

**STATUS (2026-07-20): the auto-deploy for the monorepo push FAILED** (Vercel status =
`failure` on `main`) because the project's **Root Directory is still `.`** (old flat-repo
setting). The live card keeps serving the **last good (old) deploy**, so it is *not* down —
but new commits will not ship until the project is reconfigured.

**Fix (Vercel dashboard → project `github-readme-stats` → Settings):** — confirmed by the
successor's own `docs/deploy.md` step 11.

1. **General → Root Directory → set to `apps/backend`** (so `apps/backend/vercel.json` +
   `vercel-preparation.sh` drive the Build Output API v3 build). ← fix #1. (Current: `null`/root.)
2. **General → Node.js Version → set to `24.x`** (or the highest offered, ≥22). ← fix #2.
   The monorepo pins **Node 24** (`.nvmrc`=v24, `engines.node:"24.x"`); the project is currently
   on **18.x**, which fails the build regardless of Root Directory.
3. **Environment Variables** — keep **`PAT_1`** (your GitHub PAT; classic `repo`+`read:user`
   for private-contribution counts). Add **`TURBO_PLATFORM_ENV_DISABLED=true`** to silence a
   harmless turbo build warning.
4. Leave Framework Preset = **Other**; do not override Build/Install commands (vercel.json owns them).
5. **Redeploy.** The `/api?username=` route still exists (`router.js:82`) → your existing card
   URL stays valid once the build succeeds.

Verified project facts (via `vercel pull`, 2026-07-20): `projectId prj_bsHRXoXznHpnLmNup1dxKAUoXAJp`,
`orgId team_DadBqbdhHPz8nHkqprKhTwIs`, current `rootDirectory=null`, `nodeVersion=18.x`,
`framework=none`. A local `vercel build`/`--prebuilt` deploy is **not viable on Windows** — the
build pipeline (`vercel-preparation.sh`, `shopt`, `cp -RP`) is Linux-shell-only; Vercel builds it
on Linux. So the two settings above must be changed via the dashboard or the Vercel REST API.

Optional (NOT needed for the static card, and left OFF by our security patch): `POSTGRES_URL`
+ `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET`/`OAUTH_REDIRECT_URI` enable the OAuth "trends" web
app; `CRON_SECRET` for the proactive-regeneration cron. Our `requireOAuth` guard keeps those
endpoints 404 until you set the OAuth trio.

> Note: GitHub's "Sync Fork" button will **not** appear (this repo isn't a true GitHub fork of
> the successor — parent is null). Use the manual `git merge extended/master` flow above.

Old card URL (unchanged, still valid):
`https://github-readme-stats-boazcstrike.vercel.app/api?username=boazcstrike&count_private=true&show_icons=true&theme=dark&include_all_commits`

## Deployment STATUS — RESOLVED (2026-07-20) ✅

The monorepo now builds and serves on Vercel. What it took:

1. **Root Directory** `null → apps/backend` (via REST API).
2. **Node** `18.x → 24.x` (monorepo pins Node 24).
3. **`ENABLE_EXPERIMENTAL_COREPACK=1`** — first build failed with `pnpm deploy: Unknown option
   'legacy'` because Vercel defaulted to **pnpm@9** ("based on project creation date"); the
   build command's `--legacy` flag needs **pnpm@10**, which Vercel only honors with Corepack
   enabled (respects the `packageManager` field → pnpm@10.34.1).
4. **`TURBO_PLATFORM_ENV_DISABLED=true`** — silences a turbo warning.

Result: production build READY. `github-readme-stats-five-mu-85.vercel.app/api?username=boazcstrike&count_private=true&...`
renders the full card (private counts work → `PAT_1` present).

### ⚠️ Two-project gotcha (action needed)

There are **two** Vercel deployments in play:

| URL | Scope / project | State |
|-----|-----------------|-------|
| `github-readme-stats-boazcstrikes-projects.vercel.app` / `…-five-mu-85.vercel.app` | **team** `boazcstrikes-projects`, project `github-readme-stats` (git-connected, auto-deploys) | ✅ **fixed + patched monorepo** |
| `github-readme-stats-boazcstrike.vercel.app` | **personal** scope `boazcstrike` — lingering alias from before the project moved to the team | ⚠️ **stale old code, NOT auto-deploying** |

**The profile README (`boazcstrike/boazcstrike`) embeds the stale personal URL.** To put the
profile on the maintained+patched deploy, repoint the card host:

```
https://github-readme-stats-boazcstrike.vercel.app/api?...   ❌ stale
https://github-readme-stats-five-mu-85.vercel.app/api?...    ✅ fixed team project
```

(`five-mu-85` is the project's verified custom domain and tracks production;
`…-boazcstrikes-projects.vercel.app` works too.)

**DONE (2026-07-20):** profile README (`boazcstrike/boazcstrike`) repointed to
`github-readme-stats-five-mu-85.vercel.app` (commit `d193753`). Card verified live.

### Legacy Vercel app — `github-readme-stats-boazcstrike.vercel.app` (decommission manually)

Before this project was moved into the **team** scope (`boazcstrikes-projects`), it ran as a
**personal-scope** Vercel app at **`github-readme-stats-boazcstrike.vercel.app`**. That old app:

- still resolves and serves a card (**stale/old code**), so it looked like it was "working";
- is **not** git-connected to the current flow and does **not** receive new deploys;
- is **invisible to the team-scoped API token** used for the fix — so it could not be deleted
  programmatically from this session.

**To remove it (manual, needs personal-scope access):**
1. vercel.com/dashboard → top-left scope switcher → select your **personal** account
   (`boazcstrike`), not the `boazcstrikes-projects` team.
2. Open the old `github-readme-stats` project there → **Settings → Advanced → Delete Project**.
3. (Optional) confirm nothing else still embeds `…-boazcstrike.vercel.app` first — the profile
   README no longer does.

Why keep this note: the two look identical in a browser (both return a stats SVG), so it is
easy to "fix" the wrong one. The **team** project (`five-mu-85` / `boazcstrikes-projects`) is the
live, maintained, git-connected, security-patched one. The personal `…-boazcstrike` app is the
legacy leftover.

## CI / auto-deploy hygiene — dependabot + pnpm catalog (2026-07-22)

**Problem:** every dependabot PR triggered a Vercel **preview** deploy, and many failed →
a flood of "deployment failed" emails. Two independent root causes.

### 1. Vercel now skips non-`main` builds (the spam fix)

Added an `ignoreCommand` to **`apps/backend/vercel.json`** (project Root Directory):

```json
"ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ]"
```

Vercel semantics: **exit 1 → build; exit 0 → skip.** So `main` builds, every other branch
(dependabot/preview) is skipped (shows as **Canceled**, never `Error` → no failure email).
Production is unaffected — `main` still auto-deploys.

> ⚠️ `ignoreCommand` is read from **each branch's own** `vercel.json`. NEW dependabot PRs branch
> from `main` and inherit the gate. EXISTING branches cut before the gate must be **rebased**
> (`@dependabot rebase`) to pick it up — verified: rebased branches then deploy `Canceled`, not `Error`.

### 2. pnpm `catalog:` vs dependabot lockfile drift (build ERESOLVE / OUTDATED_LOCKFILE)

Dependency versions live in **`pnpm-workspace.yaml`** under `catalog:` (e.g. `vitest`, `@vitest/*`),
and `package.json` references them as `"vitest": "catalog:default"`. When dependabot bumps such a
dep it **pins the resolved version into the lockfile's specifier field** instead of keeping
`catalog:default`, so Vercel's `pnpm install --frozen-lockfile` aborts:

```
ERR_PNPM_OUTDATED_LOCKFILE
  specifiers in the lockfile don't match specifiers in package.json:
  - vitest (lockfile: 4.1.10, manifest: catalog:default)
```

**Fix (per broken PR / after merging one to `main`):**

```bash
corepack pnpm install --lockfile-only   # restores specifier to catalog:default, keeps new version
corepack pnpm install --frozen-lockfile # verify it now passes
git commit -am "fix: restore catalog specifier in pnpm-lock" && git push
```

The diff is a **single line** (`specifier: 4.1.10` → `specifier: catalog:default`). With the gate
above, a broken dependabot branch no longer emails — but **merging it to `main` will fail the
production build** until you run the regen. (Historic case: PR #39 vitest bump.)

### 3. Dependabot tuned to cut PR/deploy volume

`.github/dependabot.yml`: `interval daily → weekly`, `open-pull-requests-limit 20 → 5`, dropped the
unused **`devcontainers`** ecosystem. (npm + github-actions ecosystems kept.)

## Security posture

### Dependency audit — CLEAN

`pnpm audit` (2026-07-20): **0 vulnerabilities** across 559 dependencies
(critical 0 / high 0 / moderate 0 / low 0 / info 0).

### Code audit

Two parallel security agents reviewed the runtime code (2026-07-20). **All findings below
are inherited from the `github-stats-extended` successor codebase — none were introduced by
the sync.** They only matter if you deploy the backend API with these endpoints live.

**Well-defended (no issues found):** SVG/color XSS (all text via `encodeHTML`, all colors via
`isPrefixedHexColor`/`isValidGradient`, all numerics via `Number.isFinite`), ReDoS,
request-param SQL injection (parameterized `$1` queries), prototype pollution, frontend
secret leakage (only public `CLIENT_ID` exposed; OAuth secret stays server-side), open
redirect, `dangerouslySetInnerHTML`.

**Findings, most severe first:**

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | ~~**HIGH**~~ ✅ **PATCHED** | `packages/core/src/fetchers/wakatime.js` | **SSRF** — `api_domain` query param interpolated into outbound URL unvalidated. Unauthenticated `/api/wakatime?api_domain=`. Attacker → cloud-metadata (`169.254.169.254`), localhost, or arbitrary host. `username` also un-encoded → path traversal off the fixed path. *(Confirmed independently by both agents.)* **Fork patch:** `api_domain` now validated as bare hostname, private/metadata IPs blocked, `username` `encodeURIComponent`-wrapped, `err.response` guarded. *This diverges from upstream — re-apply after each `extended` merge, or drop once fixed upstream.* **Test note:** the patch blocks `.local`/`.internal`/private-IP hosts, so `tests/public-instance/wakatime.test.js` must mock a **non-blocked** `api_domain` (uses `wakatime.example.com`); a `.local` domain renders the error card and fails the snapshot. |
| 2 | ~~**HIGH**~~ ✅ **MITIGATED** | `apps/backend/api-renamed/user-access.js` | **Token disclosure** — unauthenticated `GET /api/user-access?user_key=` returns raw GitHub OAuth `access_token`. Secret `user_key` travels in URL query string (`frontend/src/api/user.ts`) → leaks to CDN/proxy logs + Referer. **Fork patch:** all OAuth endpoints (`user-access`/`authenticate`/`downgrade`/`delete-user`) now **secure-by-default** — gated by `requireOAuth()` (`accessGuard.js`); if OAuth isn't configured (`OAUTH_CLIENT_ID`+`OAUTH_CLIENT_SECRET`+`POSTGRES_URL`) they return **404** and never touch the DB/token. This eliminates the surface on the static-card deployment. *Residual (only if OAuth enabled):* `user_key` still rides in the URL query string — see upstream issue draft; real fix = move it to `Authorization` header/POST body. |
| 3 | ~~MEDIUM~~ ✅ **PATCHED** | `apps/backend/api-renamed/repeat-recent.js` + `src/repeatRequests.js:28` | Unauthenticated request-amplification endpoint; replays all stored request URLs, no batch cap → DoS/PAT-quota burn. **Fork patch:** now requires `Authorization: Bearer $CRON_SECRET` (constant-time compare, `requireCronSecret`). Set `CRON_SECRET` in Vercel env + cron config. |
| 4 | MEDIUM | `apps/frontend/src/components/Card/SvgInline.tsx:109` | Server SVG injected via `innerHTML` into live shadow root (not `<img>`) → removes the "SVG-is-just-an-image" mitigation; whole XSS surface now depends on zero escaping gaps. Use `<img src>` or DOMPurify. *(Not patched — frontend web-app only; report upstream.)* |
| 5 | MEDIUM | `apps/backend/src/common/database.js:79,106` | SQL `INTERVAL '${interval}'` string-interpolated (value from env, not request — low reach today). Parameterize with `make_interval`. *(Not patched — env-sourced, low reach; report upstream.)* |
| 6 | ~~MEDIUM~~ ✅ **PATCHED** | OAuth handlers | Internal `err.message` returned to client → info disclosure (pg/axios internals). **Fork patch:** OAuth handlers now return generic `"Something went wrong"` + 500. *(Other handlers noted for upstream.)* |
| 7 | LOW | all card routes (`router.js`) | No server-side rate limiting anywhere → unauth abuse exhausts GitHub PAT quota (DoS). Only CDN cache headers. |
| 8 | LOW | `packages/core/src/common/html.ts:9` | `encodeHTML` `(?!#)` lookahead skips escaping before `#` — weaker than it looks (not currently exploitable). |
| 9 | LOW | `packages/core/src/cards/wakatime.js:74,347` | `languageColors[lang.name]` written to `fill=` without the `isPrefixedHexColor` guard used elsewhere; `Object.prototype` key returns a function. Use `Object.hasOwn`. |
| 10 | INFO | `apps/frontend` dep | `save-svg-as-png@^1.4.17` effectively unmaintained (no known CVE); keep off untrusted SVG. |

**Priority if deploying the backend:** fix #1 (SSRF) and #2 (token vending) first — both
unauthenticated and high-impact. #1 is a small localized patch (allowlist `api_domain` +
`encodeURIComponent(username)`).

> ⚠️ These live in upstream successor code. Patching them here diverges from
> `github-stats-extended` and adds future merge friction — consider reporting upstream
> (issue/PR to `stats-organization/github-stats-extended`) instead of / in addition to a local fix.

## Open decision

- Whether to also **archive** this fork (it mirrors a deprecated original's successor).
  Current direction: keep it alive tracking `github-stats-extended`. Revisit if the successor
  itself goes inactive.
