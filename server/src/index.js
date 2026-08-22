import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { operatorRouter } from "./routes/operator.js";
import { adminRouter } from "./routes/admin.js";

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/operator", operatorRouter);
app.use("/api/admin", adminRouter);

app.get("/api/health", (req, res) => res.json({ ok: true, service: "furusato-operator-portal" }));

app.use(express.static(config.webDir));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(config.webDir, "login.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "サーバーエラーが発生しました" });
});

app.listen(config.port, () => {
  console.log(`事業者向け管理ポータル起動: http://localhost:${config.port}`);
});
