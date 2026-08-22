import { Router } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { operatorsStore, productsStore, nextId } from "../db.js";
import { config } from "../config.js";
import { requireAdminAuth } from "../middleware/auth.js";
import { parseMasterFile } from "../utils/importMaster.js";
import { generatePassword, generateOperatorId } from "../utils/password.js";

export const adminRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 1000 * 60 * 60 * 8,
};

adminRouter.post("/login", (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== config.adminPassword) {
    return res.status(401).json({ error: "パスワードが正しくありません" });
  }
  const token = jwt.sign({ role: "admin" }, config.jwtSecret, { expiresIn: "8h" });
  res.cookie("admin_token", token, COOKIE_OPTS);
  res.json({ token, ok: true });
});

adminRouter.post("/logout", (req, res) => {
  res.clearCookie("admin_token");
  res.json({ ok: true });
});

adminRouter.use(requireAdminAuth);

// 塩尻市マスタ（xlsx/csv）をアップロードし、事業者ごとにID/パスワードを発行して返礼品を紐付ける
adminRouter.post("/import-master", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "ファイルが指定されていません" });

  const municipality = (req.body?.municipality || "塩尻市").trim();
  const prefix = (req.body?.operatorIdPrefix || "SJR").trim();

  let groups;
  try {
    groups = parseMasterFile(req.file.buffer, req.file.originalname);
  } catch (err) {
    return res.status(400).json({ error: `マスタの解析に失敗しました: ${err.message}` });
  }

  const operators = operatorsStore.read();
  const products = productsStore.read();
  const created = [];
  const updated = [];

  let seq = operators.length + 1;

  for (const group of groups) {
    let operator = operators.find(
      (o) => o.municipality === municipality && (o.sourceOperatorId === group.operatorId || o.name === group.operatorName)
    );

    let plainPassword = null;
    if (!operator) {
      const operatorId = generateOperatorId(prefix, seq++);
      plainPassword = generatePassword();
      operator = {
        id: nextId(operators),
        operatorId,
        sourceOperatorId: group.operatorId,
        name: group.operatorName,
        municipality,
        passwordHash: bcrypt.hashSync(plainPassword, 10),
        active: true,
        createdAt: new Date().toISOString(),
      };
      operators.push(operator);
      created.push({ operatorId: operator.operatorId, name: operator.name, password: plainPassword, productCount: group.products.length });
    } else {
      updated.push({ operatorId: operator.operatorId, name: operator.name, productCount: group.products.length });
    }

    for (const p of group.products) {
      const existing = products.find((prod) => prod.operatorId === operator.id && prod.productCode === p.productCode);
      if (existing) {
        Object.assign(existing, p, { updatedAt: new Date().toISOString() });
      } else {
        products.push({
          id: nextId(products),
          operatorId: operator.id,
          ...p,
          pendingPrice: null,
          pendingDesiredDate: null,
          pendingShippingFrom: null,
          pendingShippingTo: null,
          pendingAcceptFrom: null,
          pendingAcceptTo: null,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  operatorsStore.write(operators);
  productsStore.write(products);

  res.json({
    ok: true,
    municipality,
    operatorsCreated: created,
    operatorsUpdated: updated,
    totalOperators: groups.length,
  });
});

adminRouter.get("/operators", (req, res) => {
  const operators = operatorsStore.read().map((o) => ({
    id: o.id,
    operatorId: o.operatorId,
    name: o.name,
    municipality: o.municipality,
    active: o.active,
    createdAt: o.createdAt,
  }));
  const products = productsStore.read();
  const withCounts = operators.map((o) => ({
    ...o,
    productCount: products.filter((p) => p.operatorId === o.id).length,
  }));
  res.json(withCounts);
});

adminRouter.post("/operators/:id/reset-password", (req, res) => {
  const id = Number(req.params.id);
  const operators = operatorsStore.read();
  const operator = operators.find((o) => o.id === id);
  if (!operator) return res.status(404).json({ error: "事業者が見つかりません" });

  const plainPassword = generatePassword();
  operator.passwordHash = bcrypt.hashSync(plainPassword, 10);
  operatorsStore.write(operators);

  res.json({ ok: true, operatorId: operator.operatorId, password: plainPassword });
});

adminRouter.post("/operators/:id/toggle-active", (req, res) => {
  const id = Number(req.params.id);
  const operators = operatorsStore.read();
  const operator = operators.find((o) => o.id === id);
  if (!operator) return res.status(404).json({ error: "事業者が見つかりません" });

  operator.active = !operator.active;
  operatorsStore.write(operators);
  res.json({ ok: true, active: operator.active });
});
