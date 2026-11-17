export const ORIGIN = 'https://officenoun.xyz';
export const CHAIN = 'solana:mainnet-beta';
export const SOL = 'So11111111111111111111111111111111111111112';
const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function catalogFromCoins(coins) {
  const seen = new Set();
  return coins.map(coin => {
    if (!mintPattern.test(coin.mint) || seen.has(coin.mint)) throw new Error('Invalid or duplicate catalog mint');
    seen.add(coin.mint);
    return { id: `${CHAIN}:${coin.mint}`, chain: CHAIN, mint: coin.mint,
      name: coin.name, symbol: coin.ticker, description: coin.blurb ?? null,
      decimals: null, tokenProgram: null, onchainVerified: false,
      source: `${ORIGIN}/market/coins.json`,
      marketUrl: `${ORIGIN}/market/?trade=${encodeURIComponent(coin.mint)}`,
      apiUrl: `${ORIGIN}/market/api/v1/assets/${coin.mint}.json` };
  });
}
// A paper research note, not an order, quote, approval, or signable transaction.
export function paperTicket(assets, mint, amountSol) {
  const asset = assets.find(item => item.mint === mint && item.chain === CHAIN);
  if (!asset) throw new Error('Choose an exact catalog mint, not a ticker.');
  if (typeof amountSol !== 'string' || !/^(0|[1-9]\d{0,8})(\.\d{1,9})?$/.test(amountSol)) throw new Error('Enter SOL as a positive decimal, at most 9 decimal places.');
  const [whole, fraction = ''] = amountSol.split('.');
  const amountAtomic = (BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0'))).toString();
  if (amountAtomic === '0') throw new Error('Amount must be greater than zero.');
  return { schemaVersion: '1.0', kind: 'paper-research-ticket', status: 'not-quoted',
    chain: CHAIN, inputMint: SOL, outputMint: asset.mint, inputAmountAtomic: amountAtomic,
    inputDecimals: 9, outputDecimals: asset.decimals, expectedOutputAtomic: null,
    minimumOutputAtomic: null, fees: null, route: null, quoteExpiresAt: null,
    executable: false, transaction: null, approval: null,
    marketUrl: asset.marketUrl,
    notice: 'Not a quote or authorization. No wallet connected, funds reserved, or transaction prepared. Human must request a fresh quote and review it in their wallet.' };
}
