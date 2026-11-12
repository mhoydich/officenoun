// Pulls the wallet's public numbers and latest mints from tzkt and writes public/kit/snapshot.json.
// On any network error: warn, leave the existing file alone, exit 0.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public/kit/snapshot.json");
const api = "https://api.tzkt.io/v1";
const limit = 24;

try {
  const config = JSON.parse(await readFile(path.join(root, "site.config.json"), "utf8"));
  const wallet = config.wallet;
  if (!/^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(wallet ?? "")) throw new Error("site.config.json has no valid wallet");

  const get = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  };
  const select = "contract,tokenId,totalSupply,holdersCount,firstTime,metadata";
  const [account, count, list] = await Promise.all([
    get(`${api}/accounts/${wallet}`),
    get(`${api}/tokens/count?firstMinter=${wallet}`),
    get(`${api}/tokens?firstMinter=${wallet}&sort.desc=firstTime&limit=${limit}&select=${select}`)
  ]);
  if (!Array.isArray(list)) throw new Error("unexpected token list");

  const image = (meta) => {
    for (const key of ["displayUri", "thumbnailUri", "artifactUri", "image"]) {
      if (typeof meta?.[key] === "string" && meta[key]) return meta[key];
    }
    return "";
  };

  const snapshot = {
    wallet,
    at: new Date().toISOString(),
    balanceTez: Number(account.balance) / 1e6,
    published: Number(count),
    held: Number(account.activeTokensCount),
    transactions: Number(account.numTransactions),
    tokens: list.map((token) => ({
      contract: typeof token.contract === "object" ? token.contract?.address ?? "" : String(token.contract ?? ""),
      tokenId: String(token.tokenId),
      name: String(token.metadata?.name ?? ""),
      supply: Number(token.totalSupply),
      holders: Number(token.holdersCount),
      firstTime: token.firstTime ?? "",
      image: image(token.metadata)
    }))
  };
  if (![snapshot.balanceTez, snapshot.published, snapshot.held, snapshot.transactions].every(Number.isFinite)) throw new Error("non-numeric fields in response");

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`snapshot: ${wallet} ${snapshot.balanceTez.toFixed(2)} tez, ${snapshot.tokens.length} tokens of ${snapshot.published} published.`);
} catch (error) {
  console.warn(`snapshot: warning, kept the existing file. ${error.message}`);
}
