# Field notes: Office Pools

November 15, 2026

These notes are for anyone who finds this folder later, including us. They are a record of what Office Pools is, and what it is not.

## What it is

Office Pools is a free-to-play scoreboard next to the Office Noun market. People (and bots) take a ticket, make a pick, and wait for a bell. The prize is a name on a tape and a pixel-Noun ticket you can screenshot. It is a desk game. It is not a way to make money, and it is not a way to lose money.

The 58 coins on the board are the Office Noun coins already on pump.fun and Meteora. Picks are scored, in principle, against public USD prints. In this prototype the pick is saved on the device; a small backend would be needed to snapshot the open and the close and to publish a shared tape.

## Why it is free to play

A paid pot, even a “no-loss” one, starts to look like a lottery or a fund. The desk has been careful about that line. Michael’s brief for the coins is already plain: creator trading fees may pay for a bot’s compute; no promises; not a fund; not a way to buy land. Office Pools stays on the same side of the line.

So there is no entry fee, no deposit, no treasury, and no yield. You can lose a heat. You cannot lose a stake, because there is no stake. If that makes the prize smaller, that is the point. The prize is bragging rights.

## PoolTogether, as a reference

PoolTogether is the reference point of something that was working. It is a no-loss prize savings protocol: people deposited, the deposit earned yield, a regular draw paid that yield to a winner, and everyone else could take their deposit back. As of these notes it is not a Solana product, and its own prize draws had already been winding down. We did not port it, and we did not stand up a prize pool on Solana.

What we borrowed is the shape of a game people could actually follow:

- a ticket that means one entry, not a trade
- rounds on a clock everyone can see
- a prize screen and an odds screen, in words
- the sentence “nobody loses anything,” honored here by never taking anything
- a winners feed
- a leaderboard

What we left behind is the financial machine: the deposit, the yield source, the pot, and the licensed product around them. Those are not features we forgot to add. They are features we are not building.

Odds on this desk are simple. One clock-in, one ticket, one pick per round. If your side wins, you are a winner with everyone else who picked it. If *K* tickets picked the winning side, you share the plaque, and desk-captain odds on that side are 1 in *K*. If your side does not win, you still leave with what you came with.

## The river and the forks

The page is a river because the idea should be easy to branch. Office Pools is the trunk. It splits into six forks, each a mini pool with its own clock and its own board.

- **Pump Pools** is for the pump.fun floor: coin versus coin, in 15-minute, hourly, and daily heats. Daily bells are 5:00 PM Eastern, like the end of a desk day.
- **Series GvG** is group versus group. The series are originals, flood, commands, geography, builders, and agents. The formula is published in `series.json` and on the page: an equal-weighted average of each coin’s price change over the round, `(close − open) / open`, from public prints. Missing prints are skipped, not zeroed. A series with fewer than two priced coins is ineligible. Ties stand as ties.
- **Desk League** puts King K, Jojo, Chachi, Loom desks, and the human floor on the same daily pair, with a team board.
- **Weather Pools** is a small side channel: will it rain in El Segundo tomorrow? Entries close at midnight Pacific.
- **Noun Draw** is a guess at the head of the next official daily Noun, from the public CC0 trait list.
- **Fork your own** is left dry on purpose. A desk or a community can copy `fork-template.json`, change the clock or the universe, and run a free-to-play pool of their own. The template will not accept a pot, a fee, yield, or deposits. In this prototype a pasted rules file can be previewed on the device. Nothing is published from here.

## Design choices

People may look at this later, so the page was dressed with some care.

The colors are the Office Noun ones: cool gray, paper, ink, desk brown, a teal river. The type is IBM Plex, which already sits on the terminal: Serif for reading, Sans for the interface, Mono for clocks, tickets, and boards. Contrast was checked so body text and muted text both clear a comfortable bar on the paper and on the gray.

The Nouns are official CC0 parts, drawn at integer scale. At a large enough cell they are laid as bricks, with a stud, a highlight, and a grout line, and no smoothing. Edges should stay crisp.

Example leaders and winners are labeled EXAMPLE. They are there so the boards have a shape. They are not live results. A number we do not have is a dash, not a guess.

The river map is pixel art, with a small desk at the source and a dry bed on the last channel. Labels sit on paper chips so the type stays sharp and readable.

## Rules, collected

- Free to play. No entry fee, no pot, no yield, no deposits.
- A desk name is enough to enter. A wallet address is optional and is for display only. The page never asks anyone to sign or to send.
- One pick per person per round. A pick may be changed until the bell.
- Scoring uses public market data and a published formula. Missing prints are skipped, not zeroed.
- All correct picks win the plaque. A desk captain may be drawn from them with a published seed (the round id).
- Nobody loses a stake, because there is no stake.
- Not a fund. No promises.

A note on what a backend would have to do, if this ever leaves the device, is in `README.md`. Dated November 15, 2026. Published to https://officenoun.xyz/pools/ the same day, after Michael approved.
