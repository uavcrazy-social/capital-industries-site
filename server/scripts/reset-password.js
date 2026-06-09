import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import argon2 from "argon2";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const databasePath = path.resolve(
  serverRoot,
  process.env.DATABASE_PATH || "./data/accounts.sqlite"
);
const username = String(process.argv[2] || "").trim();
const newPassword = String(process.argv[3] || "");
const usernamePattern = /^[A-Za-z0-9_]{3,16}$/;

if (!usernamePattern.test(username) || newPassword.length < 12 || newPassword.length > 128) {
  console.error("Usage: npm run reset-password -- <MinecraftUsername> <12-128-character-new-password>");
  process.exit(1);
}

if (!fs.existsSync(databasePath)) {
  console.error(`Database not found: ${databasePath}`);
  process.exit(1);
}

const db = new Database(databasePath);
const passwordHash = await argon2.hash(newPassword, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
});
const result = db.prepare(`
  UPDATE accounts
  SET password_hash = ?, updated_at = ?
  WHERE minecraft_username_normalized = ?
`).run(passwordHash, new Date().toISOString(), username.toLowerCase());

if (result.changes === 0) {
  console.error("No account matched that Minecraft username.");
  process.exit(1);
}

db.prepare(`
  DELETE FROM sessions
  WHERE account_id IN (
    SELECT id FROM accounts WHERE minecraft_username_normalized = ?
  )
`).run(username.toLowerCase());

console.log("Password reset and existing sessions cleared.");
