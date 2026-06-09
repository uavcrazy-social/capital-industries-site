# Capital Industries Account Backend

The public site is static, so password-based account management requires a server-side API. The included `server/` folder is a small Node.js backend that can serve the site and expose `/api/...` endpoints from the same `capitalindustries.net` origin.

## Features

- Create account with Minecraft Java username + password.
- Login/logout with an HTTP-only session cookie.
- Change Minecraft username after explicit confirmation.
- Change password while signed in.
- No email provider, no email verification, no 2FA.
- Manual password reset script for admin use.
- SQLite storage in `server/data/accounts.sqlite` by default.

## Deploy

```bash
cd server
cp .env.example .env
npm install
npm start
```

Use a reverse proxy so `https://capitalindustries.net/` reaches this Node process. If the existing web server already serves static files, proxy only `/api/` to Node and keep the static files where they are.

Example Nginx shape:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

If Node serves the full site, proxy `/` instead of only `/api/`.

## Environment

```bash
NODE_ENV=production
PORT=3000
PUBLIC_ORIGIN=https://capitalindustries.net
DATABASE_PATH=./data/accounts.sqlite
SESSION_COOKIE_NAME=ci_session
SESSION_DAYS=30
```

## Manual password reset

There is no email recovery flow. Reset forgotten passwords from the server shell:

```bash
cd server
npm run reset-password -- PlayerName "new-long-password-here"
```

This clears existing sessions for the account.

## Security notes

Do not store passwords in frontend code or localStorage. The backend stores Argon2id hashes only, and login state is held in an HTTP-only cookie.

Without email verification or Minecraft OAuth, the site cannot prove that the person creating an account owns the Minecraft account. This first pass relies on explicit user confirmation and manual support for mistakes.
