import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../public/kit/office-ui.css", import.meta.url), "utf8");
const js = await readFile(new URL("../public/kit/office-ui.js", import.meta.url), "utf8");
const page = await readFile(new URL("../public/kit/ui/index.html", import.meta.url), "utf8");

test("every rule is scoped under .ou so the kit never restyles a host page", () => {
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]+\{/g, "").split("}").map((b) => b.split("{")[0].trim()).filter(Boolean);
  for (const sel of selectors) for (const part of sel.split(",")) assert.match(part.trim(), /^\.ou\b|^:root|^from|^to|^\d/, part.trim());
});

test("the script makes no network calls and inserts no HTML", () => {
  assert.doesNotMatch(js, /fetch\(|XMLHttpRequest|innerHTML|insertAdjacentHTML|document\.write/);
});

test("the kit page shows all eight parts and both files", () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) assert.match(page, new RegExp(`${n} · `));
  assert.match(page, /office-ui\.css/);
  assert.match(page, /office-ui\.js/);
});
