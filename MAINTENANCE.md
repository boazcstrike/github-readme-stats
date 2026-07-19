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
| 1 | **HIGH** | `packages/core/src/fetchers/wakatime.js:17-21` | **SSRF** — `api_domain` query param interpolated into outbound URL unvalidated. Unauthenticated `/api/wakatime?api_domain=`. Attacker → cloud-metadata (`169.254.169.254`), localhost, or arbitrary host. `username` also un-encoded → path traversal off the fixed path. *(Confirmed independently by both agents.)* |
| 2 | **HIGH** | `apps/backend/api-renamed/user-access.js:12-23` | **Token disclosure** — unauthenticated `GET /api/user-access?user_key=` returns raw GitHub OAuth `access_token`. Secret `user_key` travels in URL query string (`frontend/src/api/user.ts`) → leaks to CDN/proxy logs + Referer. No rate limit. Key leak = full token compromise. |
| 3 | MEDIUM | `apps/backend/api-renamed/repeat-recent.js` + `src/repeatRequests.js:28` | Unauthenticated request-amplification endpoint; replays all stored request URLs, no batch cap → DoS/PAT-quota burn. Needs `CRON_SECRET`. |
| 4 | MEDIUM | `apps/frontend/src/components/Card/SvgInline.tsx:109` | Server SVG injected via `innerHTML` into live shadow root (not `<img>`) → removes the "SVG-is-just-an-image" mitigation; whole XSS surface now depends on zero escaping gaps. Use `<img src>` or DOMPurify. |
| 5 | MEDIUM | `apps/backend/src/common/database.js:79,106` | SQL `INTERVAL '${interval}'` string-interpolated (value from env, not request — low reach today). Parameterize with `make_interval`. |
| 6 | MEDIUM | multiple handlers | Internal `err.message` returned to client (`"Something went wrong: " + err.message`) → info disclosure (pg/axios internals). |
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
