import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function requireOperatorAuth(req, res, next) {
  const token = req.cookies?.operator_token || (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "ログインが必要です" });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== "operator") throw new Error("role mismatch");
    req.operator = payload;
    next();
  } catch {
    return res.status(401).json({ error: "セッションが無効です。再ログインしてください" });
  }
}

export function requireAdminAuth(req, res, next) {
  const token = req.cookies?.admin_token || (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "管理者ログインが必要です" });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== "admin") throw new Error("role mismatch");
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "セッションが無効です。再ログインしてください" });
  }
}
