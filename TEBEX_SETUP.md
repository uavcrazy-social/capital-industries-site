# Tebex Headless Checkout Setup

This site uses direct Headless Tebex checkout from `/store/`.

## Current frontend behavior

- `Player` is display-only and is not connected to checkout.
- `Member`, `Premium`, and `Elite` are checkout buttons when `RANK_PURCHASES_ENABLED` is true.
- Buyers must continue on `/account/` with Google or Discord.
- Buyers must link a Minecraft username (one-time setup popup + confirmation) before checkout.
- Only one active rank subscription is allowed per account / in-game name.
- Checkout uses the linked username from Supabase `profiles`, not a free-text field.
- Tebex checkout handles payment UI and payment processing.

## Public frontend values

Edit `assets/tebex-store.js` only for public identifiers:

```js
var RANK_PURCHASES_ENABLED = true;
var TEBEX_PUBLIC_TOKEN = "REPLACE_WITH_TEBEX_PUBLIC_TOKEN";
var PACKAGE_IDS = {
  member: "REPLACE_WITH_MEMBER_PACKAGE_ID",
  premium: "REPLACE_WITH_PREMIUM_PACKAGE_ID",
  elite: "REPLACE_WITH_ELITE_PACKAGE_ID"
};
```

Do not put a Tebex private key, webhook secret, or admin API secret in this browser file.

## Account management

Public login is Google or Discord only. See `SUPABASE_SETUP.md` for provider configuration and migrations.

`/account/` shows:

- Linked in-game username and connected providers
- Active subscription (from Tebex webhook sync)
- Manage / cancel subscription (Tebex payment portal — includes payment history)
- One-rank policy (checkout blocked while a subscription is active)

Deploy the `tebex-webhook` Supabase Edge Function so `subscriptions` and `purchases` stay synced in Supabase for admin/backend use. Customers see payment history in the Tebex portal, not on the account page.

## Tebex package setup

1. Make sure the store/game type is Minecraft Java-compatible.
2. Make sure each paid package is enabled and has the correct monthly price:
   - Member: `$5.99 / mo`
   - Premium: `$10.99 / mo`
   - Elite: `$20.99 / mo`
3. In each package, add initial, renewal, expiry, refund, and chargeback commands.
4. Test every command manually in the server console before putting it in Tebex.
5. Connect Tebex command delivery using the Minecraft plugin/mod or RCON adapter.

## Rank delivery source of truth

The website collects the user-confirmed Java username and opens checkout. LuckPerms/FTB/KubeJS server-side sync should remain the source of truth for permissions, limits, homes, claims, force-load caps, badges, demotions, and command access.
