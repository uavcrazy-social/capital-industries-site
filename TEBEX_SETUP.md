# Tebex Headless Checkout Setup

This site uses direct Headless Tebex checkout from `/store/`.

## Current frontend behavior

- `Player` is display-only and is not connected to checkout.
- `Member`, `Premium`, and `Elite` are active checkout buttons.
- Before checkout opens, the buyer must enter a Minecraft Java username.
- Mojang/Minecraft name lookup is temporarily disabled because browser-side lookup was failing.
- The browser validates only the Java username format, then requires a manual confirmation checkbox.
- Tebex checkout handles payment UI and payment email capture. The static site does not require its own email provider.

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

Do not put a Tebex private key, webhook secret, admin API secret, SMTP password, or mail provider secret in this browser file.

## Account management

The `/account/` page has been added, but password accounts require the included backend service under `server/`. Static hosting alone cannot safely create password accounts.

See `ACCOUNT_BACKEND.md` for deployment and reset instructions.

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

The website only collects the user-confirmed current Java username and opens checkout. LuckPerms/FTB/KubeJS server-side sync should remain the source of truth for permissions, limits, homes, claims, force-load caps, badges, demotions, and command access.
