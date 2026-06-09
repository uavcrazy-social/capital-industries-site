import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import argon2 from "argon2";
import Database from "better-sqlite3";
import express from "express";
import helmet from "helmet";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteRoot = path.resolve(__dirname, "..");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "";
const DATABASE_PATH = path.resolve(
  __dirname,
  process.env.DATABASE_PATH || "./data/accounts.sqlite"
);
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "ci_session";
const SESSION_DAYS = Number.parseInt(process.env.SESSION_DAYS || "30", 10);
const SESSION_TTL_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 12;

const db = openDatabase(DATABASE_PATH);
const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "16kb" }));
app.use(requireSameOrigin);

app.get("/api/health", (request, response) => {
  response.json({ ok: true });
});

app.post("/api/auth/register", rateLimit("register"), async (request, response, next) => {
  try {
    const payload = readAuthPayload(request.body);

    if (!payload.usernameConfirmed) {
      return response.status(400).json({ error: "Confirm the Minecraft username before creating an account." });
    }

    if (!isPasswordValid(payload.password)) {
      return response.status(400).json({ error: "Password must be 12-128 characters." });
    }

    const passwordHash = await hashPassword(payload.password);
    const now = new Date().toISOString();

    const insert = db.prepare(`
      INSERT INTO accounts (
        minecraft_username,
        minecraft_username_normalized,
        username_confirmed,
        password_hash,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    let accountId;
    try {
      const result = insert.run(
        payload.minecraftUsername,
        normalizeUsername(payload.minecraftUsername),
        1,
        passwordHash,
        now,
        now
      );
      accountId = Number(result.lastInsertRowid);
    } catch (error) {
      if (String(error.code) === "SQLITE_CONSTRAINT_UNIQUE") {
        return response.status(409).json({ error: "An account already exists for that Minecraft username." });
      }
      throw error;
    }

    const account = getAccountById(accountId);
    await createSession(response, accountId);
    response.status(201).json({ account: toPublicAccount(account) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", rateLimit("login"), async (request, response, next) => {
  try {
    const payload = readAuthPayload(request.body);
    const account = getAccountByUsername(payload.minecraftUsername);

    if (!account || !await argon2.verify(account.password_hash, payload.password)) {
      return response.status(401).json({ error: "Invalid username or password." });
    }

    await createSession(response, account.id);
    response.json({ account: toPublicAccount(account) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", async (request, response, next) => {
  try {
    const session = getSessionFromRequest(request);

    if (!session) {
      return response.json({ account: null });
    }

    const account = getAccountById(session.account_id);

    if (!account) {
      clearSessionCookie(response);
      return response.json({ account: null });
    }

    response.json({ account: toPublicAccount(account) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (request, response) => {
  const token = getCookie(request, SESSION_COOKIE_NAME);

  if (token) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  clearSessionCookie(response);
  response.json({ ok: true });
});

app.put("/api/account/profile", requireAuth, rateLimit("profile"), (request, response, next) => {
  try {
    const minecraftUsername = String(request.body?.minecraftUsername || "").trim();
    const usernameConfirmed = Boolean(request.body?.usernameConfirmed);

    if (!USERNAME_PATTERN.test(minecraftUsername)) {
      return response.status(400).json({ error: "Use a valid Java username: 3-16 letters, numbers, or underscores." });
    }

    if (!usernameConfirmed) {
      return response.status(400).json({ error: "Confirm the username before saving." });
    }

    const normalized = normalizeUsername(minecraftUsername);
    const existing = getAccountByUsername(minecraftUsername);

    if (existing && existing.id !== request.account.id) {
      return response.status(409).json({ error: "Another account already uses that Minecraft username." });
    }

    db.prepare(`
      UPDATE accounts
      SET minecraft_username = ?,
          minecraft_username_normalized = ?,
          username_confirmed = ?,
          updated_at = ?
      WHERE id = ?
    `).run(minecraftUsername, normalized, 1, new Date().toISOString(), request.account.id);

    response.json({ account: toPublicAccount(getAccountById(request.account.id)) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/account/password", requireAuth, rateLimit("password"), async (request, response, next) => {
  try {
    const currentPassword = String(request.body?.currentPassword || "");
    const newPassword = String(request.body?.newPassword || "");

    if (!isPasswordValid(newPassword)) {
      return response.status(400).json({ error: "New password must be 12-128 characters." });
    }

    const account = getAccountById(request.account.id);

    if (!account || !await argon2.verify(account.password_hash, currentPassword)) {
      return response.status(401).json({ error: "Current password is incorrect." });
    }

    const passwordHash = await hashPassword(newPassword);
    db.prepare("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, new Date().toISOString(), account.id);
    db.prepare("DELETE FROM sessions WHERE account_id = ? AND token_hash != ?")
      .run(account.id, request.session.token_hash);

    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use("/server", (request, response) => {
  response.status(404).sendFile(path.join(siteRoot, "404.html"));
});

app.use(express.static(siteRoot, {
  extensions: ["html"],
  fallthrough: true,
  index: "index.html",
  maxAge: process.env.NODE_ENV === "production" ? "10m" : 0
}));

app.use("/api", (request, response) => {
  response.status(404).json({ error: "API route not found." });
});

app.use((request, response) => {
  response.status(404).sendFile(path.join(siteRoot, "404.html"));
});

app.use((error, request, response, next) => {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  console.error({
    message: error.message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack
  });

  if (statusCode >= 500) {
    response.status(statusCode).json({ error: "Internal server error." });
    return;
  }

  response.status(statusCode).json({ error: error.message || "Request failed." });
});

app.listen(PORT, () => {
  cleanupExpiredSessions();
  console.log(`Capital Industries account backend listening on port ${PORT}.`);
});

function openDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      minecraft_username TEXT NOT NULL,
      minecraft_username_normalized TEXT NOT NULL UNIQUE,
      username_confirmed INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_account_id ON sessions(account_id);
  `);
  return database;
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function isPasswordValid(password) {
  return typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH;
}

function readAuthPayload(body) {
  const minecraftUsername = String(body?.minecraftUsername || "").trim();
  const password = String(body?.password || "");
  const usernameConfirmed = Boolean(body?.usernameConfirmed);

  if (!USERNAME_PATTERN.test(minecraftUsername)) {
    const error = new Error("Use a valid Java username: 3-16 letters, numbers, or underscores.");
    error.statusCode = 400;
    throw error;
  }

  return {
    minecraftUsername,
    password,
    usernameConfirmed
  };
}

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

async function createSession(response, accountId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(`
    INSERT INTO sessions (account_id, token_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(accountId, hashToken(token), now.toISOString(), expires.toISOString());

  response.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires
  });
}

function clearSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
}

function getCookie(request, name) {
  const header = request.headers.cookie || "";
  const cookies = header.split(";").map((cookie) => cookie.trim()).filter(Boolean);

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = decodeURIComponent(cookie.slice(0, separator));

    if (key === name) {
      return decodeURIComponent(cookie.slice(separator + 1));
    }
  }

  return "";
}

function getSessionFromRequest(request) {
  const token = getCookie(request, SESSION_COOKIE_NAME);

  if (!token) {
    return null;
  }

  const session = db.prepare(`
    SELECT sessions.*, accounts.id AS account_exists
    FROM sessions
    LEFT JOIN accounts ON accounts.id = sessions.account_id
    WHERE token_hash = ? AND expires_at > ?
  `).get(hashToken(token), new Date().toISOString());

  if (!session || !session.account_exists) {
    return null;
  }

  return session;
}

function requireAuth(request, response, next) {
  const session = getSessionFromRequest(request);

  if (!session) {
    clearSessionCookie(response);
    return response.status(401).json({ error: "Sign in required." });
  }

  const account = getAccountById(session.account_id);

  if (!account) {
    clearSessionCookie(response);
    return response.status(401).json({ error: "Sign in required." });
  }

  request.session = session;
  request.account = account;
  next();
}

function getAccountById(id) {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) || null;
}

function getAccountByUsername(username) {
  return db.prepare("SELECT * FROM accounts WHERE minecraft_username_normalized = ?")
    .get(normalizeUsername(username)) || null;
}

function toPublicAccount(account) {
  return {
    id: account.id,
    minecraftUsername: account.minecraft_username,
    usernameConfirmed: Boolean(account.username_confirmed),
    createdAt: account.created_at,
    updatedAt: account.updated_at
  };
}

function requireSameOrigin(request, response, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return next();
  }

  const origin = request.get("origin");

  if (!origin) {
    return next();
  }

  const expectedOrigin = PUBLIC_ORIGIN || `${request.protocol}://${request.get("host")}`;

  if (origin !== expectedOrigin) {
    return response.status(403).json({ error: "Cross-origin request rejected." });
  }

  return next();
}

function rateLimit(scope) {
  const attempts = new Map();

  return (request, response, next) => {
    const now = Date.now();
    const username = normalizeUsername(request.body?.minecraftUsername || "");
    const key = `${scope}:${request.ip}:${username}`;
    const bucket = attempts.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }

    bucket.count += 1;
    attempts.set(key, bucket);

    if (bucket.count > RATE_LIMIT_MAX) {
      response.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return response.status(429).json({ error: "Too many attempts. Try again shortly." });
    }

    return next();
  };
}

function cleanupExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
}
