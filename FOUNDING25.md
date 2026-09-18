# The Founding 25

The Founding 25 is permanent public recognition for the first 25 genuine community members who opt in and can be verified as holding `$EXIT` on Arc.

It is **not** a giveaway, investment program, profit promise, paid ranking, governance right, or token reward.

## What counts

A Founding member must:

1. Be a real community participant who opts into public recognition.
2. Control a wallet with a positive `$EXIT` balance at verification time.
3. Be one person/community participant per Founding spot.
4. Not be a liquidity pool, router, protocol address, project-controlled wallet, or an obvious duplicate-wallet attempt.

Once a legitimate member is verified and published, the Founding record is permanent. If that person later sells, the website may show `OG RECORD` instead of `HOLDING NOW`, but the Founding spot is not recycled.

## Add a member

Do **not** hand-edit a new address into `founding-roster.json`.

Run:

```bash
node scripts/add-founding-member.mjs \
  --address 0xYOUR_ADDRESS \
  --name "Public name" \
  --x "@handle"
```

The script:

- confirms Arc chain ID `5042`;
- reads the wallet's `$EXIT` balance directly from `https://rpc.arc-scan.org` using ERC-20 `balanceOf`;
- requires the balance to be greater than zero;
- rejects contract addresses by default;
- records the Arc block number and raw balance observed at verification;
- appends the verified entry to `founding-roster.json`.

For a legitimate community smart wallet, `--allow-contract` can be used only after manually confirming it is not a pool, router, protocol, or project-controlled address.

## Public website behavior

The website intentionally keeps two numbers separate:

- **Onchain holder addresses** — live informational count from Arc Explorer. This can include pools, contracts, project wallets, and people who never opted in.
- **Verified Founding members** — only roster entries with recorded direct Arc RPC verification metadata.

For every published Founding member, the site also rechecks the wallet's current `$EXIT` balance through Arc RPC:

- `HOLDING NOW` = positive current balance.
- `OG RECORD` = no current balance, but permanent Founding recognition remains.
- `RPC UNAVAILABLE` = the live check could not complete; the stored Founding record is not removed.

## Contract

`0x1b556933D64AE9bb32044711C5393B2E5663d185`
