# Office Pools

A static prototype for a possible [officenoun.xyz/pools](https://officenoun.xyz/pools) page. Plain HTML, CSS and JavaScript. No build step, no packages, no analytics, no custody, no signing.

Published to https://officenoun.xyz/pools/ on November 15, 2026 (America/New_York) after Michael approved. It remains free to play, with bragging rights only.

## What it is

Office Pools is a free-to-play scoreboard for the 58 Office Noun coins. The prize is bragging rights and a pixel-Noun ticket. There is no entry fee, no pot, no yield, and no deposit.

The page is laid out as a river with six forks, each a mini pool with its own clock and board:

1. **Pump Pools** — coin-vs-coin pick’em, in 15-minute, hourly, and daily heats.
2. **Series GvG** — originals, flood, commands, geography, builders, and agents, scored with a published formula.
3. **Desk League** — King K, Jojo, Chachi, Loom desks, and the human floor, on the daily pair.
4. **Weather Pools** — will it rain in El Segundo tomorrow?
5. **Noun Draw** — guess the head of the next official daily Noun.
6. **Fork your own** — an empty branch and a JSON rules template for a desk that wants its own pool.

PoolTogether is the reference point for the shape of the game (tickets, a visible clock, a prize-and-odds screen, “nobody loses anything,” a winners tape, a leaderboard). Office Pools does not hold funds and does not pay a prize from yield. See `FIELD-NOTES.md`.

## Local preview

From this directory:

```sh
python3 -m http.server 8777
```

Open http://127.0.0.1:8777/. Use HTTP, not `file://`, so the browser can fetch the JSON files. Stop the server with Ctrl-C.

A close-up of the ticket is at http://127.0.0.1:8777/?shot=ticket (an example ticket, labeled as such).

## Files

- `index.html` — page structure, field notes, and the river map.
- `styles.css` — Office Noun colors, IBM Plex typography, paper tickets, layout.
- `app.js` — clocks, entries, live prices, tickets, fork preview.
- `nouns.js` — integer-scale brick renderer for the 32×32 Nouns.
- `coins.json` — the 58 public coins, with a `series` field.
- `series.json` — series membership and the GvG formula.
- `nouns.json` — palette and pixel data, copied from the terminal renderer.
- `heads.json` — official CC0 Noun head traits for the Noun Draw.
- `fork-template.json` — rules sheet a community can copy.
- `example-feed.json` — placeholder leaders and winners, labeled EXAMPLE.
- `river.png` — pixel watershed map.
- `fonts/` — IBM Plex Sans, Serif, and Mono (SIL OFL 1.1).
- `FIELD-NOTES.md` — a longer, dated note on the idea, the reference, and the rules.
- `pools.png`, `pools-ticket.png` — local screenshots of this prototype.

Entries are stored in `localStorage` under `officenoun-pools-v1` (desk name, optional display address, tickets). A wallet field is a name tag, not a login. The page never asks for a signature, a seed phrase, or a transfer.

## Live prices

Same pattern as `/market` and `/terminal`. The client asks GeckoTerminal first (`/api/v2/networks/solana/tokens/multi/{mints}`, 30 per batch), then DexScreener (`/latest/dex/tokens/{mints}`) for fallback prices and for 24-hour change. Unknown numbers render as a dash. Zero is only shown when the feed returns zero. The GvG table’s 24-hour lean is unofficial; official heats need open and close snapshots from a backend.

## What a backend would need

The existing metadata worker at `officenoun-pump-meta.mhoydich.workers.dev` (or a sibling worker) could host this later. It would need to:

1. **Accept entries** before each bell: desk name, optional display address, fork, round id, pick. Reject entries after the bell. Rate-limit. Store no seed phrases and request no signatures.
2. **Snapshot prices** at open and close from GeckoTerminal, with DexScreener as fallback, for the coins in that heat. Publish the prints next to the result.
3. **Settle Weather Pools** from a public source (Open-Meteo or NWS) for El Segundo, California, after the Pacific calendar day ends.
4. **Settle Noun Draw** from the public Nouns auction result (the minted Noun’s head trait).
5. **Publish** a results JSON, a winners tape, and leaderboards. Freeze the tape at the bell so clients are not the source of truth.
6. **Not** take deposits, not run a pot, not route yield, and not hold keys.

This prototype does none of that. Tickets stay on the device that created them.

## Hosting — not executed

If this is ever published, the folder can sit at `/pools/` on the same GitHub Pages site as `/market/` and `/terminal/`. That takes Michael’s OK, and a deploy, and is not part of this work.
