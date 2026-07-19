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

**To keep the profile card working after adopting this monorepo, the Vercel project must be
reconfigured:** set **Root Directory = `apps/backend`** (so `apps/backend/vercel.json` is used),
let Vercel use the Build Output API output, and keep the `PAT_1` (GitHub token) env var. The
`/api?username=` route still exists (`router.js:82`), so the existing card URL stays valid once
the build succeeds.

> If auto-deploy is on, pushing this branch may trigger a build with the **old** project
> settings, which will fail — Vercel keeps the last good deploy live, so the card should not
> break, but the new features won't ship until the project is reconfigured. Verify in the
> Vercel dashboard.

Old card URL (unchanged, still valid):
`https://github-readme-stats-boazcstrike.vercel.app/api?username=boazcstrike&count_private=true&show_icons=true&theme=dark&include_all_commits`

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
| 1 | ~~**HIGH**~~ ✅ **PATCHED** | `packages/core/src/fetchers/wakatime.js` | **SSRF** — `api_domain` query param interpolated into outbound URL unvalidated. Unauthenticated `/api/wakatime?api_domain=`. Attacker → cloud-metadata (`169.254.169.254`), localhost, or arbitrary host. `username` also un-encoded → path traversal off the fixed path. *(Confirmed independently by both agents.)* **Fork patch:** `api_domain` now validated as bare hostname, private/metadata IPs blocked, `username` `encodeURIComponent`-wrapped, `err.response` guarded. *This diverges from upstream — re-apply after each `extended` merge, or drop once fixed upstream.* |
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
