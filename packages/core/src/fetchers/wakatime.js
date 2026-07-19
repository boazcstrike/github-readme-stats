import axios from "axios";

import { CustomError, MissingParamError } from "../common/error.js";

// SSRF hardening (fork patch): a caller-supplied `api_domain` must be a bare
// hostname with an optional port only — no path/query/fragment/userinfo — so it
// cannot be used to redirect the outbound request to an attacker-chosen URL.
const VALID_API_DOMAIN = /^[a-z0-9.-]+(:[0-9]{1,5})?$/i;

// Block hosts that resolve (literally) to loopback / private / link-local ranges,
// including the cloud metadata endpoint (169.254.169.254).
const BLOCKED_HOST = (host) => {
  const h = host.split(":")[0].toLowerCase();
  return (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "169.254.169.254" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) ||
    h.endsWith(".internal") ||
    h.endsWith(".local")
  );
};

const resolveApiDomain = (api_domain) => {
  if (!api_domain) {
    return "wakatime.com";
  }
  const candidate = api_domain.replace(/\/+$/g, "");
  if (!VALID_API_DOMAIN.test(candidate) || BLOCKED_HOST(candidate)) {
    throw new CustomError(
      "Invalid api_domain",
      "WAKATIME_INVALID_API_DOMAIN",
    );
  }
  return candidate;
};

/**
 * WakaTime data fetcher.
 *
 * @param {{username: string, api_domain: string }} props Fetcher props.
 * @returns {Promise<import("./types").WakaTimeData>} WakaTime data response.
 */
const fetchWakatimeStats = async ({ username, api_domain }) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  try {
    const { data } = await axios.get(
      `https://${resolveApiDomain(api_domain)}/api/v1/users/${encodeURIComponent(
        username,
      )}/stats?is_including_today=true`,
    );

    return data.data;
  } catch (err) {
    if (err.response && (err.response.status < 200 || err.response.status > 299)) {
      throw new CustomError(
        `Could not resolve to a User with the login of '${username}'`,
        "WAKATIME_USER_NOT_FOUND",
      );
    }
    throw err;
  }
};

export { fetchWakatimeStats };
