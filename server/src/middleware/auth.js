import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function requireOperatorAuth(req, res, next) {
  const token = req.cookies?.operator_token || (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "ログインが必要です" });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== "operator") throw new Error("role mismatch");
    req.operator = payload;

    // 利用があるたびに有効期限を延長し、再ログインを求めないようにする
    const { role, id, operatorId, name, municipality } = payload;
    const refreshed = jwt.sign({ role, id, operatorId, name, municipality }, config.jwtSecret, {
      expiresIn: `${config.operatorSessionDays}d`,
    });
    res.cookie("operator_token", refreshed, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * config.operatorSessionDays,
    });

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
