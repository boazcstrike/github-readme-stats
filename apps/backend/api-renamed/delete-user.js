import { logger } from "@stats-organization/github-readme-stats-core";

import { requireOAuth } from "../src/common/accessGuard.js";
import { deleteUser } from "../src/common/database.js";

/**
 * @param {any} req The request.
 * @param {any} res The response.
 */
export default async (req, res) => {
  if (!requireOAuth(res)) {
    return;
  }
  const { user_key } = req.query;
  try {
    await deleteUser(user_key);
  } catch (err) {
    logger.error(err);
    res.statusCode = 500;
    res.send("Something went wrong");
    return;
  }
  res.send("ok");
};
