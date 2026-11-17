import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { catalogFromCoins, ORIGIN } from '../public/market/agents/model.mjs';
export async function buildMarketAgents(publicDir, distDir) {
  const { coins } = JSON.parse(await readFile(path.join(publicDir, 'market/coins.json'), 'utf8'));
  const assets = catalogFromCoins(coins);
  const dir = path.join(distDir, 'market/api/v1');
  await mkdir(path.join(dir, 'assets'), { recursive: true });
  const write = (name, value) => writeFile(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');
  await write('assets.json', { schemaVersion: '1.0', source: `${ORIGIN}/market/coins.json`,
    freshness: 'Catalog at site build, not live prices or on-chain verification.', assets });
  await Promise.all(assets.map(asset => write(`assets/${asset.mint}.json`, asset)));
  await write('capabilities.json', { schemaVersion: '1.0', mode: 'read-only',
    catalog: `${ORIGIN}/market/api/v1/assets.json`, documentation: `${ORIGIN}/market/agents/`,
    openapi: `${ORIGIN}/market/agents/openapi.json`,
    supported: ['list_assets', 'get_asset', 'local_paper_ticket'],
    unsupported: ['quote_swap', 'trade_status', 'sign', 'execute', 'custody', 'mcp'],
    authentication: 'none', permissions: 'No trade authority is granted by these documents.' });
}
