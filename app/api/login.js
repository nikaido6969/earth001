import { OPERATORS, verifyPassword, signToken } from "./_store.js";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { operatorId, password } = req.body || {};
  if (!operatorId || !password) {
    return res.status(400).json({ error: "事業者IDとパスワードを入力してください" });
  }

  const operator = OPERATORS.find((o) => o.operatorId === String(operatorId).trim().toUpperCase());
  if (!operator || !verifyPassword(String(password).trim(), operator.salt, operator.passwordHash)) {
    return res.status(401).json({ error: "事業者IDまたはパスワードが正しくありません" });
  }

  const token = signToken({
    operatorId: operator.operatorId,
    name: operator.name,
    municipality: operator.municipality,
  });

  res.status(200).json({
    token,
    operator: { operatorId: operator.operatorId, name: operator.name, municipality: operator.municipality },
  });
}
