import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderCharterPage, renderDeskPage, normalizeDesk } from "../scripts/desk-pages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deskTemplate = await readFile(path.join(root, "src/desk.template.html"), "utf8");
const charterTemplate = await readFile(path.join(root, "src/charter.template.html"), "utf8");
const MINT = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

test("desk not issued: no address, no buy link, says so", () => {
  const html = renderDeskPage(deskTemplate, { mint: "" });
  assert.match(html, /not issued/);
  assert.match(html, /nothing has been issued/);
  assert.match(html, /is not this one until the address appears here and on the x account/);
  assert.doesNotMatch(html, /pump\.fun/);
  assert.doesNotMatch(html, /data-desk-mint/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /data-desk-fees>undecided</);
  assert.match(html, /data-desk-sells>undecided</);
  assert.doesNotMatch(html, /\{\{/);
});

test("desk issued: address and pump.fun link, same plain facts", () => {
  const html = renderDeskPage(deskTemplate, { mint: MINT, fees_to: "the desk wallet", desk_sells: "never" });
  assert.match(html, new RegExp(`<code data-desk-mint>${MINT}</code>`));
  assert.match(html, new RegExp(`href="https://pump\\.fun/coin/${MINT}"`));
  assert.doesNotMatch(html, /nothing has been issued/);
  assert.match(html, /data-desk-fees>the desk wallet</);
  assert.match(html, /data-desk-sells>never</);
  assert.match(html, /most memecoins go to zero/);
  assert.match(html, /another day at the office\. one noun a day at a desk\. cc0\. officenoun\.xyz/);
});

test("desk always has risk note and og tags", () => {
  for (const mint of ["", MINT]) {
    const html = renderDeskPage(deskTemplate, { mint });
    assert.match(html, /no promise of value/);
    assert.match(html, /not an investment/);
    assert.match(html, /art is on tezos and is separate/);
    for (const tag of ["og:title", "og:description", "og:image"]) assert.match(html, new RegExp(`property="${tag}"`));
  }
});

test("desk rejects a bad mint and escapes free text", () => {
  assert.throws(() => normalizeDesk({ mint: "not an address" }), /Solana address/);
  const html = renderDeskPage(deskTemplate, { fees_to: "<b>x</b>" });
  assert.doesNotMatch(html, /<b>x/);
});

test("charter caps show not set when empty, values when set", () => {
  const empty = renderCharterPage(charterTemplate, { caps: { per_action: "", per_day: "" } });
  assert.match(empty, /data-cap="per_action">not set</);
  assert.match(empty, /data-cap="per_day">not set</);
  const set = renderCharterPage(charterTemplate, { caps: { per_action: "1 SOL", per_day: "3 SOL" } });
  assert.match(set, /data-cap="per_action">1 SOL</);
  assert.match(set, /data-cap="per_day">3 SOL</);
});

test("charter lists desks from config and states the rules", () => {
  const html = renderCharterPage(charterTemplate, {});
  for (const name of ["Office Noun desk", "Ledger", "Grok Bot", "Duet"]) assert.match(html, new RegExp(name));
  assert.match(html, /never a green light/);
  assert.match(html, /own chat/);
  assert.match(html, /#officenoun/);
  assert.match(html, /never name collectors/);
  assert.doesNotMatch(html, /\{\{/);
  const custom = renderCharterPage(charterTemplate, { desks: [{ name: "Night desk", role: "sleeps", holds: "no keys" }] });
  assert.match(custom, /Night desk/);
  assert.doesNotMatch(custom, /Grok Bot/);
});
