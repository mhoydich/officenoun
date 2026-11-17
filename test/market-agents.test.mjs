import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { catalogFromCoins, paperTicket, CHAIN } from '../public/market/agents/model.mjs';
import { buildMarketAgents } from '../scripts/market-agents.mjs';
const root = new URL('../', import.meta.url).pathname;
const { coins } = JSON.parse(await readFile(path.join(root, 'public/market/coins.json')));
const assets = catalogFromCoins(coins);
test('catalog preserves exact chain/mint identity and unknown chain facts', () => {
 assert.equal(assets.length, coins.length);
 assert.equal(new Set(assets.map(a=>a.id)).size, assets.length);
 for (const a of assets) { assert.equal(a.id, `${CHAIN}:${a.mint}`); assert.equal(a.decimals,null); assert.equal(a.onchainVerified,false); assert.equal(new URL(a.marketUrl).searchParams.get('trade'),a.mint); }
});
test('invalid and duplicate catalog mints fail build',()=>{
 assert.throws(()=>catalogFromCoins([{...coins[0],mint:'../bad'}]));
 assert.throws(()=>catalogFromCoins([coins[0],coins[0]]));
});
test('exact decimal conversion with no floating point loss',()=>{
 for (const [amount,atomic] of [['0.000000001','1'],['0.01','10000000'],['999999999.999999999','999999999999999999']]) assert.equal(paperTicket(assets,assets[0].mint,amount).inputAmountAtomic,atomic);
});
test('reject ticker, unknown mint, non-Solana asset and invalid amounts',()=>{
 for(const mint of ['NOPE',coins[0].ticker,'11111111111111111111111111111111']) assert.throws(()=>paperTicket(assets,mint,'1'));
 assert.throws(()=>paperTicket([{...assets[0],chain:'other'}],assets[0].mint,'1'));
 for(const value of ['0','-1','1e3','NaN','Infinity','0.0000000001','01',' 1','1.',1,'1000000000']) assert.throws(()=>paperTicket(assets,assets[0].mint,value));
});
test('ticket never fabricates quote, permission or transaction',()=>{
 const t=paperTicket(assets,assets[0].mint,'1');
 assert.equal(t.executable,false); assert.equal(t.status,'not-quoted');
 for(const k of ['transaction','approval','expectedOutputAtomic','minimumOutputAtomic','fees','route','quoteExpiresAt']) assert.equal(t[k],null);
});
test('build writes every listed mint and read-only capabilities',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'market-test-'));
 try { await buildMarketAgents(path.join(root,'public'),dir);
 const read=async file=>JSON.parse(await readFile(path.join(dir,'market/api/v1',file)));
 assert.deepEqual((await read('assets.json')).assets,assets);
 for(const a of assets) assert.deepEqual(await read(`assets/${a.mint}.json`),a);
 assert.equal((await read('capabilities.json')).mode,'read-only');
 assert.ok((await read('capabilities.json')).unsupported.includes('execute'));
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('OpenAPI is GET-only and entrance loads no wallet script',async()=>{
 const api=JSON.parse(await readFile(path.join(root,'public/market/agents/openapi.json')));
 for(const route of Object.values(api.paths))assert.deepEqual(Object.keys(route),['get']);
 const html=await readFile(path.join(root,'public/market/agents/index.html'),'utf8');
 assert.doesNotMatch(html,/plugin\.jup|wallet-adapter/);
 const js=await readFile(path.join(root,'public/market/agents/app.mjs'),'utf8');
 assert.doesNotMatch(js,/innerHTML|localStorage|sendTransaction|signTransaction/);
});
