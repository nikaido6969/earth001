import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || "dev-only-insecure-secret",
  adminPassword: process.env.ADMIN_PASSWORD || "admin",
  larkWebhookUrl: process.env.LARK_WEBHOOK_URL || "",
  larkWebhookSecret: process.env.LARK_WEBHOOK_SECRET || "",
  dataDir: path.join(__dirname, "..", "data"),
  webDir: path.join(__dirname, "..", "..", "web"),
};
