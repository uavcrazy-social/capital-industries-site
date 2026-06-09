# Tebex Headless Checkout Setup

This site has been patched for direct Headless Tebex checkout from `/store/`.

## Fill these values

Edit `assets/tebex-store.js`:

```js
var TEBEX_PUBLIC_TOKEN = "REPLACE_WITH_TEBEX_PUBLIC_TOKEN";
var PACKAGE_IDS = {
  member: "REPLACE_WITH_MEMBER_PACKAGE_ID",
  premium: "REPLACE_WITH_PREMIUM_PACKAGE_ID",
  elite: "REPLACE_WITH_ELITE_PACKAGE_ID"
};
```

Do not put a Tebex private key, webhook secret, or admin API secret in this file.

## Tebex side

1. Make sure the store/game type is Minecraft Java/Overwolf-compatible.
2. Make sure each package is enabled and has the correct monthly price.
3. In each package, add initial, renewal, expiry, refund, and chargeback commands.
4. Test the exact FTB Ranks command manually in the server console before putting it in Tebex.
5. Connect Tebex command delivery using the Minecraft plugin/mod or RCON Adapter.

## Frontend behavior

Player enters Java username, clicks a rank, the site creates a Tebex basket, adds one package, and opens Tebex.js checkout. There is no visible cart and no Tebex storefront page.
