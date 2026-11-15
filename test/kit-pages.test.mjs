import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// /today/, /org/ and /kit/ are generated from these templates by scripts/build.mjs.
const read = (name) => readFile(new URL(`../src/${name}.template.html`, import.meta.url), "utf8");
const pages = { today: await read("today"), org: await read("org"), kit: await read("kit") };

test("each page wears the office ui kit and nothing older", () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, /<link rel="stylesheet" href="(\.\.\/kit\/)?office-ui\.css">/, name);
    assert.match(html, /<body class="ou[ "]/, name);
    assert.doesNotMatch(html, /styles\.css/, name);
    assert.match(html, /class="ou-bar"/, name);
    assert.match(html, /class="ou-h1[ "]/, name);
  }
});

test("page css stays scoped under .ou", () => {
  for (const [name, html] of Object.entries(pages)) {
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = css.replace(/@(media|keyframes)[^{]+\{/g, "").split("}").map((b) => b.split("{")[0].trim()).filter(Boolean);
    for (const sel of selectors) for (const part of sel.split(",")) assert.match(part.trim(), /^(body)?\.ou\b|^\d+%|^from|^to/, `${name}: ${part.trim()}`);
  }
});

test("the build's placeholders and hooks survive", () => {
  for (const key of ["DAY_NUMBER", "HERO_ALT", "TRAIT_LINE", "DATE_ISO", "DATE_LABEL", "DESK", "LOTS_LINE", "GIFTS", "NAV_EXTRA"]) assert.ok(pages.today.includes(`{{${key}}}`), `today ${key}`);
  for (const id of ["h-desk", "h-lots", "h-gifts"]) assert.ok(pages.today.includes(`id="${id}"`), `today #${id}`);
  assert.match(pages.today, /querySelector\("\[data-plan\]"\)/);
  assert.match(pages.today, /data-minutes/);
  for (const key of ["STAFF", "SECTIONS", "NAV_EXTRA"]) assert.ok(pages.org.includes(`{{${key}}}`), `org ${key}`);
  for (const key of ["WALLET", "SNAPSHOT"]) assert.ok(pages.kit.includes(`{{${key}}}`), `kit ${key}`);
});

test("the kit page keeps both live demos on their own stylesheet", () => {
  assert.match(pages.kit, /<link rel="stylesheet" href="tezos-desk\.css">/);
  assert.match(pages.kit, /data-tezos-desk data-wallet="\{\{WALLET\}\}"[^>]*data-snapshot="desk-snapshot"/);
  assert.match(pages.kit, /id="desk-snapshot"/);
  assert.match(pages.kit, /data-tezos-door/);
  assert.match(pages.kit, /<script src="tezos-desk\.js"><\/script>/);
  assert.match(pages.kit, /<script src="tezos-door\.js"><\/script>/);
});

test("one banner per page", () => {
  for (const [name, html] of Object.entries(pages)) {
    const body = html.slice(html.indexOf("<body"));
    assert.equal((body.match(/<header\b/g) ?? []).length, 1, name);
  }
});
