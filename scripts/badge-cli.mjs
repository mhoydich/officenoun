// node scripts/badge-cli.mjs <handle> [out.svg]
// Same module as the /badge/ page, so the X desk renders the identical badge. Prints to stdout without out.svg.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { badgeForHandle } from "../public/kit/office-badge.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [handle, out] = process.argv.slice(2);
if (!handle) {
  console.error("usage: node scripts/badge-cli.mjs <handle> [out.svg]");
  process.exit(1);
}
const traits = JSON.parse(await readFile(path.join(root, "public/kit/badge-traits.json"), "utf8"));
const { svg } = await badgeForHandle(handle, traits);
if (out) await writeFile(out, svg);
else process.stdout.write(svg + "\n");
