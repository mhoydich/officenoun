import { paperTicket } from './model.mjs';
const $ = id => document.getElementById(id);
let assets = [];
try {
  const response = await fetch('../api/v1/assets.json', { credentials: 'omit' });
  if (!response.ok) throw new Error('Catalog request failed');
  const catalog = await response.json();
  if (catalog.schemaVersion !== '1.0' || !Array.isArray(catalog.assets) || !catalog.assets.length) throw new Error('Unsupported or empty catalog');
  assets = catalog.assets;
  for (const asset of assets) {
    const option = document.createElement('option');
    option.value = asset.mint; option.textContent = `${asset.symbol} · ${asset.name}`;
    $('asset').append(option);
  }
  $('status').textContent = `${assets.length} catalog assets. No live prices loaded.`;
  $('asset').disabled = $('make').disabled = false;
} catch {
  $('status').textContent = 'Catalog unavailable. No ticket can be prepared. Try again later or read the integration guide.';
}
$('ticket-form').addEventListener('submit', event => {
  event.preventDefault(); $('error').textContent = ''; $('market-link').hidden = true;
  try {
    const ticket = paperTicket(assets, $('asset').value, $('amount').value);
    $('ticket').textContent = JSON.stringify(ticket, null, 2);
    $('market-link').href = ticket.marketUrl; $('market-link').hidden = false;
  } catch (error) { $('ticket').textContent = 'No ticket prepared.'; $('error').textContent = error.message; }
});
