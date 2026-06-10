# Supabase Auth Setup

The site uses **Supabase Auth** with PKCE for Google and Discord login. No custom Node API is required.

Public login methods:
- Continue with Google
- Continue with Discord

Identity is managed by Supabase. The site stores only the linked Minecraft username in `public.profiles`.

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Project Settings → API** and copy:
   - Project URL
   - `anon` public key
3. Paste them into `assets/supabase-config.js`:

```js
window.CAPITAL_SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
window.CAPITAL_SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
```

## 2. Run the database migrations

In **SQL Editor**, run these in order:

1. `supabase/migrations/001_profiles.sql`
2. `supabase/migrations/002_username_unique.sql` — one Minecraft username per account
3. `supabase/migrations/003_store_records.sql` — purchase/subscription history for the account page

`profiles` uses row-level security so users can only read and update their own row.

## 3. Configure Auth redirect URLs

In **Authentication → URL Configuration**:

| Setting | Value |
|---------|-------|
| Site URL | `https://capitalindustries.net/account/` |
| Redirect URLs | `https://capitalindustries.net/account/` |
| | `https://www.capitalindustries.net/account/` |
| | `http://localhost:8080/account/` (local testing) |

## 4. Enable Google provider

1. **Authentication → Providers → Google**
2. Enable Google
3. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/)
4. Authorized redirect URI (from Supabase Google settings):

```
https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

5. Paste Google client ID and secret into Supabase

## 5. Enable Discord provider

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications)
2. **OAuth2 → Redirects** add:

```
https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

3. Copy Client ID and Client Secret into **Authentication → Providers → Discord** in Supabase

## 6. Deploy the static site

Push to GitHub Pages as usual. Auth callbacks return to `/account/` where Supabase JS exchanges the PKCE code and restores the session.

## User flow

1. User clicks **Continue with Google** or **Continue with Discord** on `/account/` (only public login methods)
2. Supabase OAuth completes and redirects back to `/account/`
3. User enters Minecraft username in the one-time setup popup (confirmation checkbox)
4. Profile row is saved in `public.profiles`
5. Store checkout requires sign-in and a linked username

## Store checkout

`assets/tebex-store.js` checks Supabase session before opening Tebex checkout. The linked `minecraft_username` from `profiles` is sent to Tebex as the basket username.

## Security notes

- Only the **anon** key belongs in static frontend code.
- RLS on `profiles` is required.
- Each Minecraft username can only be linked to one site account (unique index + availability check).
- Google and Discord are separate logins unless support manually merges them in Supabase.

## Not available

- Create account with email
- Password login
- Forgot password
- Email verification
- Site-managed email notifications

## Tebex webhook sync

Deploy `supabase/functions/tebex-webhook` and point your Tebex webhook endpoint to:

```
https://YOUR_PROJECT.supabase.co/functions/v1/tebex-webhook
```

Set Supabase secrets:

- `TEBEX_WEBHOOK_SECRET` — from Tebex Creator → Webhooks

The function writes `purchases` and `subscriptions` rows used by the account page and one-rank checkout guard.
