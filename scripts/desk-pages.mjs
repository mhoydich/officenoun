// Pure renderers for /desk/ and /charter/. No network, no chain. Used by build.mjs and the tests.
const esc = (value) =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export const DEFAULT_DESK = { name: "Office Noun", ticker: "OFFICENOUN", mint: "", fees_to: "", desk_sells: "" };
export const DEFAULT_CHARTER = {
  loom_channel: "#officenoun",
  caps: { per_action: "", per_day: "" },
  desks: [
    { name: "Office Noun desk", role: "posts and builds", holds: "no keys", chat: "" },
    { name: "Collector desk \"Ledger\"", role: "holds the Tezos wallet", holds: "the Tezos wallet", chat: "" },
    { name: "Solana desk \"Grok Bot\"", role: "holds the Solana wallet", holds: "the Solana wallet", chat: "" },
    { name: "Duet", role: "publishing", holds: "no keys", chat: "" }
  ]
};

// Solana addresses are base58, 32 to 44 characters.
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function normalizeDesk(input = {}) {
  const desk = { ...DEFAULT_DESK, ...input };
  for (const key of Object.keys(DEFAULT_DESK)) desk[key] = typeof desk[key] === "string" ? desk[key].trim() : String(desk[key] ?? "");
  if (desk.mint !== "" && !SOLANA_ADDRESS.test(desk.mint)) throw new Error("site.config.json desk.mint must be empty or a Solana address");
  return desk;
}

export function normalizeCharter(input = {}) {
  const charter = { ...DEFAULT_CHARTER, ...input, caps: { ...DEFAULT_CHARTER.caps, ...(input.caps ?? {}) } };
  charter.desks = Array.isArray(input.desks) ? input.desks : DEFAULT_CHARTER.desks;
  for (const desk of charter.desks) {
    if (!desk || typeof desk.name !== "string" || desk.name === "") throw new Error("site.config.json charter.desks entries need a name");
  }
  charter.caps = Object.fromEntries(Object.entries(charter.caps).map(([k, v]) => [k, String(v ?? "").trim()]));
  return charter;
}

const orValue = (value, fallback) => (value === "" || value == null ? fallback : esc(value));

export function renderDeskStatus(deskInput) {
  const desk = normalizeDesk(deskInput);
  const issued = desk.mint !== "";
  const status = issued
    ? [
        `        <p>issued. ${esc(desk.ticker)} on solana.</p>`,
        `        <p>address: <code data-desk-mint>${esc(desk.mint)}</code></p>`,
        `        <p><a href="https://pump.fun/coin/${esc(desk.mint)}" rel="noopener noreferrer">${esc(desk.ticker)} on pump.fun</a></p>`,
        "        <p>check the address here against the one on the x account before you do anything. if they differ, it is not this coin.</p>"
      ]
    : [
        "        <p data-desk-state=\"not-issued\">not issued.</p>",
        `        <p>nothing has been issued. any coin claiming to be ${esc(desk.ticker)} or ${esc(desk.name)} is not this one until the address appears here and on the x account.</p>`
      ];
  return { issued, html: status.join("\n") };
}

export function renderDeskFacts(deskInput) {
  const desk = normalizeDesk(deskInput);
  return [
    "      <dl class=\"desk-facts\">",
    `        <dt>name</dt><dd>${esc(desk.name)}</dd>`,
    `        <dt>ticker</dt><dd>${esc(desk.ticker)}</dd>`,
    `        <dt>chain</dt><dd>solana</dd>`,
    `        <dt>creator fees go to</dt><dd data-desk-fees>${orValue(desk.fees_to, "undecided")}</dd>`,
    `        <dt>does the desk sell</dt><dd data-desk-sells>${orValue(desk.desk_sells, "undecided")}</dd>`,
    "      </dl>"
  ].join("\n");
}

export function renderCharterDesks(charterInput) {
  const charter = normalizeCharter(charterInput);
  return [
    "      <ul class=\"charter-desks\">",
    ...charter.desks.map(
      (d) =>
        `        <li><strong>${esc(d.name)}</strong>: ${orValue(d.role, "no role set")}. holds ${orValue(d.holds, "no keys")}.${
          d.chat ? ` yes is given in ${esc(d.chat)}.` : ""
        }</li>`
    ),
    "      </ul>"
  ].join("\n");
}

export function renderCharterCaps(charterInput) {
  const charter = normalizeCharter(charterInput);
  return [
    "      <dl class=\"desk-facts\">",
    `        <dt>per action</dt><dd data-cap="per_action">${orValue(charter.caps.per_action, "not set")}</dd>`,
    `        <dt>per day</dt><dd data-cap="per_day">${orValue(charter.caps.per_day, "not set")}</dd>`,
    "      </dl>"
  ].join("\n");
}

export function renderDeskPage(template, deskInput, navExtra = "") {
  const desk = normalizeDesk(deskInput);
  const { html } = renderDeskStatus(desk);
  return template
    .replaceAll("{{DESK_NAME}}", esc(desk.name))
    .replaceAll("{{DESK_TICKER}}", esc(desk.ticker))
    .replaceAll("{{DESK_STATUS}}", () => html)
    .replaceAll("{{DESK_FACTS}}", () => renderDeskFacts(desk))
    .replaceAll("{{NAV_EXTRA}}", navExtra);
}

export function renderCharterPage(template, charterInput, navExtra = "") {
  const charter = normalizeCharter(charterInput);
  return template
    .replaceAll("{{CHARTER_DESKS}}", () => renderCharterDesks(charter))
    .replaceAll("{{CHARTER_CAPS}}", () => renderCharterCaps(charter))
    .replaceAll("{{LOOM_CHANNEL}}", esc(charter.loom_channel))
    .replaceAll("{{NAV_EXTRA}}", navExtra);
}
