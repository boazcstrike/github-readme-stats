import { createHash, timingSafeEqual } from "node:crypto";

// Fork security patch (see MAINTENANCE.md).
//
// The OAuth "trends" web-app endpoints (authenticate / user-access / downgrade /
// delete-user) vend the end-user's GitHub token back to their browser. On a
// deployment that only serves static env-PAT stat cards these endpoints are pure
// attack surface (token disclosure via `user_key` leakage). We therefore make
// them secure-by-default: unless OAuth is fully configured they respond 404 and
// touch neither the database nor any token.

/**
 * True only when every piece of the OAuth flow is configured.
 * @returns {boolean}
 */
export const isOAuthConfigured = () =>
  Boolean(
    process.env.OAUTH_CLIENT_ID &&
      process.env.OAUTH_CLIENT_SECRET &&
      process.env.POSTGRES_URL,
  );

/**
 * Gate an OAuth endpoint. Returns false (and sends 404) when OAuth is not
 * configured, so callers should `if (!requireOAuth(res)) return;`.
 * @param {any} res The response.
 * @returns {boolean}
 */
export const requireOAuth = (res) => {
  if (isOAuthConfigured()) {
    return true;
  }
  res.statusCode = 404;
  res.send("Not found");
  return false;
};

/**
 * Constant-time secret comparison. Hashing both sides to a fixed-length digest
 * lets `timingSafeEqual` run without leaking length (and without throwing on
 * unequal-length inputs).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const secretsMatch = (a, b) => {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
};

/**
 * Constant-time shared-secret check for the cron/amplification endpoint.
 * Requires `CRON_SECRET` to be set and matched via the `authorization` header
 * (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`).
 * @param {any} req The request.
 * @param {any} res The response.
 * @returns {boolean}
 */
export const requireCronSecret = (req, res) => {
  const secret = process.env.CRON_SECRET;
  const header = req.headers?.authorization || "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (secret && provided && secretsMatch(provided, secret)) {
    return true;
  }
  res.statusCode = 401;
  res.send({ error: "Unauthorized" });
  return false;
};
