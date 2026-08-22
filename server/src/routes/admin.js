import { Router } from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { operatorsStore, productsStore, nextId } from "../db.js";
import { config } from "../config.js";
import { requireAdminAuth } from "../middleware/auth.js";
import { parseMasterFile } from "../utils/importMaster.js";
import { generatePassword, generateOperatorId } from "../utils/password.js";
import { readMasterProducts } from "../sheets.js";

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

/**
 * 試験導入スコープ（青果物：りんご・ぶどう類を扱う事業者）に絞り込む。
 * 事業者名・返礼品名のキーワードは config で設定でき、対象拡大時は環境変数で変更できる。
 */
function filterToTargetScope(groups) {
  const { targetOperators, targetProductKeywords } = config;

  return groups
    .filter((g) => !targetOperators.length || targetOperators.some((kw) => g.operatorName.includes(kw)))
    .map((g) => ({
      ...g,
      products: targetProductKeywords.length
        ? g.products.filter((p) => targetProductKeywords.some((kw) => p.productName.includes(kw)))
        : g.products,
    }))
    .filter((g) => g.products.length > 0);
}

function groupByOperator(products) {
  const byOperator = new Map();
  for (const p of products) {
    const { operatorName, ...rest } = p;
    if (!byOperator.has(operatorName)) {
      byOperator.set(operatorName, { operatorName, operatorId: null, products: [] });
    }
    byOperator.get(operatorName).products.push(rest);
  }
  return Array.from(byOperator.values());
}

/** 事業者アカウントの発行と返礼品の紐付けを行う（ファイル取込・シート同期の共通処理） */
function upsertGroups(groups, municipality, prefix) {
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

  return {
    ok: true,
    municipality,
    operatorsCreated: created,
    operatorsUpdated: updated,
    totalOperators: groups.length,
  };
}

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

  res.json(upsertGroups(filterToTargetScope(groups), municipality, prefix));
});

// 塩尻市マスタ（Googleスプレッドシート）から直接読み取って同期する
adminRouter.post("/sync-master", async (req, res) => {
  const municipality = (req.body?.municipality || "塩尻市").trim();
  const prefix = (req.body?.operatorIdPrefix || "SJR").trim();

  let products;
  try {
    products = await readMasterProducts();
  } catch (err) {
    return res.status(400).json({ error: `塩尻市マスタの読み取りに失敗しました: ${err.message}` });
  }

  const groups = filterToTargetScope(groupByOperator(products));
  if (!groups.length) {
    return res.status(400).json({
      error: `対象事業者が見つかりませんでした（対象事業者: ${config.targetOperators.join(", ") || "指定なし"}）`,
    });
  }

  res.json(upsertGroups(groups, municipality, prefix));
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
