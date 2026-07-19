import { logger } from "@stats-organization/github-readme-stats-core";

import { requireOAuth } from "../src/common/accessGuard.js";
import { authenticate } from "../src/users.js";

/**
 * @param {any} req The request.
 * @param {any} res The response.
 */
export default async (req, res) => {
  if (!requireOAuth(res)) {
    return;
  }
  const { code, private_access, user_key } = req.query;
  try {
    let { userId, needDowngrade } = await authenticate(
      code,
      private_access === "true",
      user_key,
    );
    res.send({ userId, needDowngrade });
  } catch (err) {
    logger.error(err);
    res.statusCode = 500;
    res.send("Something went wrong");
  }
};
