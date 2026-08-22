import { PRODUCTS, verifyToken } from "./_store.js";

export default function handler(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ error: "ログインが必要です" });

  const items = PRODUCTS.filter((p) => p.operatorId === session.operatorId);
  res.status(200).json({ operator: session, products: items });
}
