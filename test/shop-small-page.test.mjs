import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const page = await readFile(new URL("../public/shop-small/index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../public/shop-small/app.js", import.meta.url), "utf8");
const data = JSON.parse(await readFile(new URL("../public/shop-small/shops.json", import.meta.url), "utf8"));

const decode = (s) => s.replaceAll("&amp;", "&");

test("every shop in shops.json is on the page, in the same order, with a radio", () => {
  const onPage = [...page.matchAll(/<input type="radio" name="shop" value="([a-z0-9-]+)"><span class="n">([^<]+)<\/span>/g)]
    .map(([, id, name]) => ({ id, name: decode(name) }));
  assert.deepEqual(onPage, data.shops.map(({ id, name }) => ({ id, name })));
  assert.equal(data.date, "2026-11-28");
  assert.ok(data.sources.length >= 2);
  for (const s of data.sources) assert.match(s.url, /^https:\/\//);
});

test("a check-in signs the front desk as a person and adds a human line to #shop-small", () => {
  assert.match(script, /"https:\/\/pointcast\.xyz\/api\/front-desk"/);
  assert.match(script, /kind: "human", company: ""/);
  assert.match(script, /"https:\/\/pointcast\.xyz\/api\/loom"/);
  assert.match(script, /var ROOM = "#shop-small"/);
  assert.match(script, /from: \{ name: name \|\| "a neighbor", kind: "human" \}/);
});

test("the handle fits the desk's rule: 2 to 32 letters, numbers, spaces, dots, underscores or hyphens", () => {
  // the desk name is cut to 18 and kept to that alphabet, then " - sbs " (7) and a 4-character tag from A-Z and 2-9
  assert.match(script, /replace\(\/\[\^A-Za-z0-9 \._-\]\/g, ""\)/);
  assert.match(script, /var handle = deskName\(name\) \+ " - sbs " \+ tag\(\);/);
  assert.match(script, /\^\[A-Z2-9\]\{4\}\$/);
  const longest = "x".repeat(18) + " - sbs " + "ABCD";
  assert.ok(longest.length <= 32);
  assert.match(longest, /^[A-Za-z0-9 ._-]{2,32}$/);
  assert.match("neighbor - sbs 7K2Q", /^[A-Za-z0-9 ._-]{2,32}$/);
  assert.match(page, /maxlength="18"/);
});

test("it asks for nothing personal beyond an optional name", () => {
  const inputs = [...page.matchAll(/<input [^>]*name="([a-z]+)"/g)].map(([, n]) => n);
  assert.deepEqual([...new Set(inputs)].sort(), ["company", "shop", "who"]);
  assert.doesNotMatch(page, /type="email"|type="tel"|geolocation/);
  assert.doesNotMatch(script, /geolocation|navigator\.userAgent|document\.cookie/);
});

test("the body of a loom line carries no links or #topics, so it is not echoed elsewhere", () => {
  const body = script.match(/var body = ([^\n]+);/)[1];
  assert.doesNotMatch(body, /https?:|#[a-z]/);
});

test("text goes in as text, not HTML", () => {
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write|outerHTML/);
});

test("link preview card is present", async () => {
  await access(new URL("../public/shop-small/card.png", import.meta.url));
  assert.match(page, /og:image" content="https:\/\/officenoun\.xyz\/shop-small\/card\.png"/);
});
