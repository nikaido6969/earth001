import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { operatorsStore } from "../db.js";
import { config } from "../config.js";

export const authRouter = Router();

// 事業者は一度ログインしたら再度パスワードを求めない運用のため、長期セッションにする
const SESSION_MS = 1000 * 60 * 60 * 24 * config.operatorSessionDays;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_MS,
};

authRouter.post("/login", (req, res) => {
  const { operatorId, password } = req.body || {};
  if (!operatorId || !password) {
    return res.status(400).json({ error: "事業者IDとパスワードを入力してください" });
  }

  const operators = operatorsStore.read();
  const operator = operators.find((o) => o.operatorId === operatorId.trim());
  if (!operator || !operator.active) {
    return res.status(401).json({ error: "事業者IDまたはパスワードが正しくありません" });
  }

  const ok = bcrypt.compareSync(password, operator.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "事業者IDまたはパスワードが正しくありません" });
  }

  const token = jwt.sign(
    { role: "operator", id: operator.id, operatorId: operator.operatorId, name: operator.name, municipality: operator.municipality },
    config.jwtSecret,
    { expiresIn: `${config.operatorSessionDays}d` }
  );

  res.cookie("operator_token", token, COOKIE_OPTS);
  res.json({
    token,
    operator: { id: operator.id, operatorId: operator.operatorId, name: operator.name, municipality: operator.municipality },
  });
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie("operator_token");
  res.json({ ok: true });
});
