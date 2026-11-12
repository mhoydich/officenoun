import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await import(pathToFileURL(path.join(root, "public/kit/office-dao.js")));
const { OfficeDao } = globalThis;

const A = "tz1UWibBbQXvuSkThsLUGAaL4R5j7X3PSCKj";
const B = "KT1QUWUbYFM7f47ZyUtXjxJVUv7GmeboUA6p";
const good = () => ({
  name: "  the Office ", purpose: "make one thing a day", symbol: "desk", supply: "81,000",
  holders: [{ address: A, amount: "61000" }, { address: B, amount: "20000" }],
  treasury: "5", periodDays: "3", quorum: "20", deposit: "100", powers: ["mint", "pay"]
});

test("isAddress checks prefix, length and alphabet", () => {
  assert.equal(OfficeDao.isAddress(A), true);
  assert.equal(OfficeDao.isAddress(B), true);
  assert.equal(OfficeDao.isAddress(A.slice(1)), false);
  assert.equal(OfficeDao.isAddress("tz4" + A.slice(3)), false);
  assert.equal(OfficeDao.isAddress(A.replace("U", "0")), false);
  assert.equal(OfficeDao.isAddress(42), false);
});

test("validate accepts a good form", () => {
  const r = OfficeDao.validate(good());
  assert.deepEqual(r.errors, {});
  assert.equal(r.ok, true);
});

test("validate reports each bad field in plain text", () => {
  const f = good();
  Object.assign(f, { name: " ", purpose: "", symbol: "ab", supply: "0", treasury: "-1", periodDays: "31", quorum: "0", deposit: "x", powers: [] });
  const e = OfficeDao.validate(f).errors;
  for (const k of ["name", "purpose", "symbol", "supply", "treasury", "periodDays", "quorum", "deposit", "powers"]) {
    assert.equal(typeof e[k], "string", k);
  }
});

test("validate checks holder rows and the sum", () => {
  let f = good();
  f.holders[1].amount = "19999";
  assert.match(OfficeDao.validate(f).errors.holders, /80999/);
  f = good();
  f.holders[1].address = A;
  assert.ok(OfficeDao.validate(f).errors["holder1.address"]);
  f = good();
  f.holders[0].address = "nope";
  assert.ok(OfficeDao.validate(f).errors["holder0.address"]);
  f = good();
  f.holders = [];
  assert.ok(OfficeDao.validate(f).errors.holders);
  f = good();
  f.deposit = "81001";
  assert.ok(OfficeDao.validate(f).errors.deposit);
});

test("buildCharter makes the v0 shape", () => {
  const c = OfficeDao.buildCharter(good(), Date.UTC(2026, 10, 12, 8, 0, 0));
  assert.deepEqual(Object.keys(c), ["spec", "name", "purpose", "token", "treasurySeedTez", "voting", "powers", "createdAt", "signedBy"]);
  assert.equal(c.spec, "officenoun.charter/v0");
  assert.equal(c.name, "the Office");
  assert.equal(c.token.symbol, "DESK");
  assert.equal(c.token.supply, 81000);
  assert.deepEqual(c.token.holders, [{ address: A, amount: 61000 }, { address: B, amount: 20000 }]);
  assert.deepEqual(c.voting, { periodDays: 3, quorumPct: 20, depositTokens: 100 });
  assert.deepEqual(c.powers, ["mint editions", "pay people"]);
  assert.equal(c.createdAt, "2026-11-12T08:00:00.000Z");
  assert.equal(c.signedBy, null);
});

test("canonicalJson sorts keys and is stable", () => {
  assert.equal(OfficeDao.canonicalJson({ b: 1, a: [{ d: 2, c: null }] }), '{"a":[{"c":null,"d":2}],"b":1}');
  const c = OfficeDao.buildCharter(good(), 0);
  assert.equal(OfficeDao.canonicalJson(c), OfficeDao.canonicalJson(JSON.parse(JSON.stringify(c))));
});

test("charterNonce is 43 url-safe characters and ignores signedBy", async () => {
  const c = OfficeDao.buildCharter(good(), 0);
  const n = await OfficeDao.charterNonce(c);
  assert.match(n, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await OfficeDao.charterNonce({ ...c, signedBy: { address: A, signature: "x" } }), n);
  assert.notEqual(await OfficeDao.charterNonce({ ...c, name: "other" }), n);
});

test("base64url matches the known vector", () => {
  assert.equal(OfficeDao.base64url(new TextEncoder().encode("hello?>")), "aGVsbG8_Pg");
});
