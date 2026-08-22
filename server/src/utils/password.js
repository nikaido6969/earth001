import crypto from "node:crypto";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(0,O,1,I)を除外

export function generatePassword(length = 8) {
  let out = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += CHARS[bytes[i] % CHARS.length];
  }
  return out;
}

export function generateOperatorId(prefix, seq) {
  return `${prefix}${String(seq).padStart(3, "0")}`;
}
