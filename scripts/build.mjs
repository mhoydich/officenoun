import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCanvas, svgToGrid } from "./png.mjs";
import { renderCharterPage, renderDeskPage } from "./desk-pages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readoutsDir = path.join(root, "readouts");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

// The same classic scripts the browser loads; they define globalThis.OFFICE_TRAITS and globalThis.OfficeNoun.
await import(pathToFileURL(path.join(publicDir, "office-traits.js")));
await import(pathToFileURL(path.join(publicDir, "office-noun.js")));
const { OfficeNoun } = globalThis;

const escapeHtml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function renderInline(source) {
  const code = [];
  let html = source.replace(/`([^`]+)`/g, (_, value) => {
    code.push(`<code>${escapeHtml(value)}</code>`);
    return `\u0000CODE${code.length - 1}\u0000`;
  });

  html = escapeHtml(html)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|\/[^\s)]*|#[^\s)]*)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\u0000CODE(\d+)\u0000/g, (_, index) => code[Number(index)]);

  return html;
}

function renderMarkdown(markdown) {
  const lines = markdown.replaceAll("\r\n", "\n").trim().split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  let code = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(renderInline).join("<br>\n")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(`<${list.type}>\n${list.items.map((item) => `  <li>${renderInline(item)}</li>`).join("\n")}\n</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) blocks.push(`<blockquote><p>${renderInline(quote.join(" "))}</p></blockquote>`);
    quote = [];
  };
  const flushText = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*([\w-]+)?\s*$/);
    if (fence) {
      if (code) {
        const className = code.language ? ` class="language-${escapeHtml(code.language)}"` : "";
        blocks.push(`<pre><code${className}>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
        code = null;
      } else {
        flushText();
        code = { language: fence[1] ?? "", lines: [] };
      }
      continue;
    }
    if (code) {
      code.lines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushText();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushText();
      const level = heading[1].length + 1;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushText();
      blocks.push("<hr>");
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      flushQuote();
      const type = ordered ? "ol" : "ul";
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push((ordered ?? unordered)[1]);
      continue;
    }

    const quoted = line.match(/^>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  if (code) {
    const className = code.language ? ` class="language-${escapeHtml(code.language)}"` : "";
    blocks.push(`<pre><code${className}>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
  }
  flushText();
  return blocks.join("\n");
}

function dateLabel(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function dayNumber(startDate, today) {
  const toUtc = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.max(1, Math.floor((toUtc(today) - toUtc(startDate)) / 86400000) + 1);
}

const config = JSON.parse(await readFile(path.join(root, "site.config.json"), "utf8"));
if (!/^\d{4}-\d{2}-\d{2}$/.test(config.startDate)) throw new Error("site.config.json startDate must be YYYY-MM-DD");

const today = OfficeNoun.dayNumber(config.startDate, config.timeZone);
const noun = OfficeNoun.forDay(today);
const heroAlt = `An office Noun with ${noun.description}, sitting at a desk.`;

const files = (await readdir(readoutsDir))
  .filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))
  .sort((a, b) => b.localeCompare(a));

const entries = await Promise.all(
  files.map(async (file) => {
    const date = file.slice(0, 10);
    let markdown = await readFile(path.join(readoutsDir, file), "utf8");
    // A leading "# YYYY-MM-DD" would repeat the date heading.
    const first = markdown.trim().split("\n")[0].trim();
    if (first === `# ${date}` || first === `# ${dateLabel(date)}`) markdown = markdown.trim().split("\n").slice(1).join("\n");
    return [
      `        <article class="entry" id="d-${date}">`,
      `          <h2 class="entry-date"><time datetime="${date}">Day ${dayNumber(config.startDate, date)} · ${dateLabel(date)}</time></h2>`,
      '          <div class="entry-body">',
      renderMarkdown(markdown)
        .split("\n")
        .map((line) => `            ${line}`)
        .join("\n"),
      "          </div>",
      "        </article>"
    ].join("\n");
  })
);

const daybook = entries.length
  ? [
      '      <section class="daybook" aria-label="Daybook">',
      entries.join("\n\n"),
      "      </section>"
    ].join("\n")
  : "";

// The wallet snapshot is inlined as JSON for the kit's fallback. "<" is escaped so it can never close the script tag.
let snapshotJson = "null";
try {
  const parsed = JSON.parse(await readFile(path.join(publicDir, "kit/snapshot.json"), "utf8"));
  snapshotJson = JSON.stringify(parsed).replaceAll("<", "\\u003c");
} catch {
  console.warn("No usable public/kit/snapshot.json; the wallet section will load live only.");
}

const lots = config.lots ?? { queued: 0, editions: 0, minted: 0 };
const count = new Intl.NumberFormat("en-US");
const lotsLine = `${count.format(lots.queued)} office nouns queued. ${count.format(lots.editions)} editions. all free. ${
  lots.minted > 0 ? `${count.format(lots.minted)} minted.` : "not minted yet."
}`;

const template = await readFile(path.join(root, "src/index.template.html"), "utf8");
const kitTemplate = await readFile(path.join(root, "src/kit.template.html"), "utf8");
const renderKitPage = () =>
  kitTemplate.replaceAll("{{WALLET}}", escapeHtml(config.wallet)).replaceAll("{{SNAPSHOT}}", () => snapshotJson);
// Optional pages: src/dashboard.template.html is built to /dashboard/ only if the file exists.
let dashboardTemplate = null;
try {
  dashboardTemplate = await readFile(path.join(root, "src/dashboard.template.html"), "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const NAV_DOT = '\n      <span aria-hidden="true">·</span>\n      ';
const navExtra = dashboardTemplate === null ? "" : `${NAV_DOT}<a href="../dashboard/index.html">dashboard</a>`;
const renderPage = (assetPrefix, kitHref, todayHref, orgHref, daoHref, dashboardHref, badgeHref) =>
  template
    .replaceAll("{{DAO_HREF}}", daoHref)
    .replaceAll("{{BADGE_HREF}}", badgeHref)
    .replaceAll("{{DASHBOARD_LINK}}", dashboardTemplate === null ? "" : `${NAV_DOT}<a href="${dashboardHref}">dashboard</a>`)
    .replaceAll("{{ASSET_PREFIX}}", assetPrefix)
    .replaceAll("{{KIT_HREF}}", kitHref)
    .replaceAll("{{TODAY_HREF}}", todayHref)
    .replaceAll("{{ORG_HREF}}", orgHref)
    .replaceAll("{{WALLET}}", escapeHtml(config.wallet))
    .replaceAll("{{LOTS_LINE}}", escapeHtml(lotsLine))
    .replaceAll("{{START_DATE}}", config.startDate)
    .replaceAll("{{TIME_ZONE}}", config.timeZone)
    .replaceAll("{{DAY_NUMBER}}", String(today))
    .replaceAll("{{HERO_ALT}}", escapeHtml(heroAlt))
    .replaceAll("{{TRAIT_LINE}}", escapeHtml(noun.traitLine))
    .replaceAll("{{ENTRY_DATES}}", escapeHtml(JSON.stringify(files.map((file) => file.slice(0, 10)))))
    .replaceAll("{{SITE_URL}}", escapeHtml(config.siteUrl))
    .replaceAll("{{REPO_URL}}", escapeHtml(config.repoUrl))
    .replaceAll("{{X_URL}}", escapeHtml(config.xUrl))
    .replaceAll("{{SNAPSHOT}}", () => snapshotJson)
    .replaceAll("{{DAYBOOK}}", daybook);

// Today's Noun for the hero image and the social card (both also land in public/ so the root index.html works).
const canonSvg = noun.canon ? await readFile(path.join(publicDir, noun.svgPath), "utf8") : null;
await writeFile(path.join(publicDir, "today.svg"), canonSvg ?? OfficeNoun.svg(noun));

const card = createCanvas(1200, 630, "#d5d7e1");
const [cell, nounX, nounY] = [16, 344, 24];
const desk = { x: nounX - 46, y: nounY + 32 * cell - 29, w: 604 };
card.grid(noun.grid ?? svgToGrid(canonSvg), nounX, nounY, cell);
card.rect(desk.x, desk.y, desk.w, 30, "#b5663f");
card.rect(desk.x, desk.y + 30, desk.w, 12, "#7e3e29");
card.rect(desk.x + Math.round(desk.w * 0.11), desk.y + 42, 25, 56, "#7e3e29");
card.rect(desk.x + desk.w - Math.round(desk.w * 0.11) - 25, desk.y + 42, 25, 56, "#7e3e29");
await writeFile(path.join(publicDir, "card.png"), card.png());

// The kit's own page is generated so its demo carries the current snapshot; it lives in public/ so file:// works too.
await writeFile(path.join(publicDir, "kit/index.html"), renderKitPage());

// ---- org chart and today page (generated into public/ so file:// works, then copied to dist) ----
const DEPARTMENTS = [
  ["scheduling", "scheduler"],
  ["accounts", "accountant"],
  ["binding", "binder"],
  ["morale", "morale officer"],
  ["reception", "receptionist"],
  ["mailroom", "mail clerk"],
  ["it", "technician"],
  ["break room", "break room attendant"],
  ["drafting", "drafter"],
  ["systems", "systems clerk"]
];

function orgTitle(index, size, [dept, role]) {
  if (index === 0) return `head of ${dept}`;
  if (index === size - 1 && size > 1) return `intern, ${dept}`;
  if (index === 1) return `deputy head of ${dept}`;
  if (index === 2) return `senior ${role}`;
  if (index >= size - 4 && index <= size - 2) return `junior ${role}`;
  if (index >= 4) return `associate ${role}`;
  return role;
}

const pad3 = (day) => String(day).padStart(3, "0");
await mkdir(path.join(publicDir, "nouns/day"), { recursive: true });
const dayNouns = [];
for (let day = 1; day <= today; day += 1) {
  const dayNoun = OfficeNoun.forDay(day);
  dayNouns.push(dayNoun);
  if (!dayNoun.canon) await writeFile(path.join(publicDir, `nouns/day/${pad3(day)}.svg`), OfficeNoun.svg(dayNoun));
}

const orgSections = DEPARTMENTS.map((department, deptIndex) => {
  const members = dayNouns.filter((_, index) => index % DEPARTMENTS.length === deptIndex);
  const titles = members.map((_, index) => orgTitle(index, members.length, department));
  const cards = members.map((member, index) => {
    const boss = index > 0 ? `day ${members[index - 1].day}, ${titles[index - 1]}` : deptIndex === 0 ? "the clock" : `day 1, head of ${DEPARTMENTS[0][0]}`;
    const imageSrc = member.canon ? `../${member.svgPath}` : `../nouns/day/${pad3(member.day)}.svg`;
    return [
      '          <li class="org-card">',
      `            <img src="${imageSrc}" width="96" height="96" loading="lazy" alt="${escapeHtml(`Office Noun for Day ${member.day}: ${member.description}.`)}">`,
      "            <div>",
      `              <p class="org-who">day ${member.day}</p>`,
      `              <p class="org-title">${escapeHtml(titles[index])}</p>`,
      `              <p class="org-traits">${escapeHtml(member.traitLine.toLowerCase())}</p>`,
      `              <p class="org-boss">reports to ${escapeHtml(boss)}</p>`,
      "            </div>",
      "          </li>"
    ].join("\n");
  });
  return [
    `      <section class="org-dept" aria-labelledby="dept-${deptIndex}">`,
    `        <h2 id="dept-${deptIndex}">${escapeHtml(department[0])}. <span>${members.length} on staff.</span></h2>`,
    '        <ol class="org-chain">',
    cards.join("\n"),
    "        </ol>",
    "      </section>"
  ].join("\n");
}).join("\n");

const orgTemplate = await readFile(path.join(root, "src/org.template.html"), "utf8");
await mkdir(path.join(publicDir, "org"), { recursive: true });
await writeFile(
  path.join(publicDir, "org/index.html"),
  orgTemplate.replaceAll("{{STAFF}}", String(today)).replaceAll("{{SECTIONS}}", () => orgSections).replaceAll("{{NAV_EXTRA}}", navExtra)
);

// Planned posts: data/posts-plan.json is optional. Entries need "HH:MM", text and kind.
let plan = [];
try {
  const parsed = JSON.parse(await readFile(path.join(root, "data/posts-plan.json"), "utf8"));
  if (!Array.isArray(parsed)) throw new Error("not an array");
  for (const entry of parsed) {
    const ok = entry && typeof entry.text === "string" && typeof entry.kind === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time ?? "");
    if (ok) plan.push(entry);
    else console.warn(`Skipping bad data/posts-plan.json entry: ${JSON.stringify(entry)}`);
  }
} catch (error) {
  if (error.code !== "ENOENT") console.warn(`data/posts-plan.json ignored: ${error.message}`);
}
const planMinutes = (entry) => Number(entry.time.slice(0, 2)) * 60 + Number(entry.time.slice(3));
plan = plan.map((entry, index) => ({ entry, index })).sort((a, b) => planMinutes(a.entry) - planMinutes(b.entry) || a.index - b.index).map((item) => item.entry);

const dateParts = Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: config.timeZone, year: "numeric" })
    .formatToParts(new Date())
    .map((part) => [part.type, part.value])
);
const dateIso = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
const dateLabelLong = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" }).format(
  new Date(Date.UTC(Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day)))
);

const deskHtml = plan.length
  ? [
      `          <p class="today-note">planned posts. times are ${escapeHtml(config.timeZone.toLowerCase())}.</p>`,
      `          <ol class="today-timeline" data-plan data-date="${dateIso}" data-time-zone="${escapeHtml(config.timeZone)}">`,
      ...plan.map((entry) =>
        [
          `            <li data-minutes="${planMinutes(entry)}">`,
          `              <time>${entry.time}</time><span>${escapeHtml(entry.text)}</span><span class="mark"></span>`,
          `              <span class="kind">${escapeHtml(entry.kind)}</span>`,
          "            </li>"
        ].join("\n")
      ),
      "          </ol>"
    ].join("\n")
  : "          <p>nothing planned.</p>";

const giftsText = `one fifth of every lot is held back to give away.${lots.minted > 0 ? "" : " nothing has been sent yet."}`;
const todayTemplate = await readFile(path.join(root, "src/today.template.html"), "utf8");
await mkdir(path.join(publicDir, "today"), { recursive: true });
await writeFile(
  path.join(publicDir, "today/index.html"),
  todayTemplate
    .replaceAll("{{HERO_ALT}}", escapeHtml(heroAlt))
    .replaceAll("{{TRAIT_LINE}}", escapeHtml(noun.traitLine))
    .replaceAll("{{DATE_ISO}}", dateIso)
    .replaceAll("{{DATE_LABEL}}", escapeHtml(dateLabelLong))
    .replaceAll("{{LOTS_LINE}}", escapeHtml(lotsLine))
    .replaceAll("{{GIFTS}}", escapeHtml(giftsText))
    .replaceAll("{{DAY_NUMBER}}", String(today))
    .replaceAll("{{DESK}}", () => deskHtml)
    .replaceAll("{{NAV_EXTRA}}", navExtra)
);

// ---- the office dao page: config.dao and data/mint-requests.json are rendered here; the builder itself is public/kit/office-dao.js ----
const dao = { name: "the Office", homebase: "", contract: "", token: "", tokenSymbol: "DESK", tokenSupply: 81000, treasurySeedTez: 5, ...(config.dao ?? {}) };
const KT1 = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;
if (dao.contract !== "" && !KT1.test(dao.contract)) throw new Error("site.config.json dao.contract must be empty or a KT1 address");
if (dao.token !== "" && !KT1.test(dao.token)) throw new Error("site.config.json dao.token must be empty or a KT1 address");
if (dao.homebase !== "" && !/^https:\/\//.test(dao.homebase)) throw new Error("site.config.json dao.homebase must be empty or an https URL");
const daoLink = (href, label) => `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
const daoStatus = dao.contract
  ? [
      `        <p>live. ${escapeHtml(dao.tokenSymbol)} governs it, ${count.format(dao.tokenSupply)} in total.</p>`,
      `        <p>${daoLink(dao.homebase || `https://tezos-homebase.io/explorer/dao/${dao.contract}`, "see it on homebase")} · ${daoLink(`https://tzkt.io/${dao.contract}`, "see it on tzkt")}${
        dao.token ? ` · ${daoLink(`https://tzkt.io/${dao.token}`, `${dao.tokenSymbol} token on tzkt`)}` : ""
      }</p>`,
      `        <p data-od-contract="${dao.contract}" role="status">treasury: not loaded yet.</p>`
    ].join("\n")
  : [
      "        <p>being set up.</p>",
      `        <p>planned: ${count.format(dao.tokenSupply)} ${escapeHtml(dao.tokenSymbol)}. ${escapeHtml(String(dao.treasurySeedTez))} tez in the treasury to start.</p>`,
      "        <p>no contract yet. this card fills in once there is one.</p>"
    ].join("\n");

const statusLabel = { done: "done", waiting: "waiting", tomorrow: "tomorrow" };
let mintRequests = [];
try {
  const parsed = JSON.parse(await readFile(path.join(root, "data/mint-requests.json"), "utf8"));
  if (!Array.isArray(parsed)) throw new Error("not an array");
  for (const entry of parsed) {
    if (entry && typeof entry.title === "string" && Number.isInteger(entry.count) && entry.count >= 0 && typeof entry.status === "string") mintRequests.push(entry);
    else console.warn(`Skipping bad data/mint-requests.json entry: ${JSON.stringify(entry)}`);
  }
} catch (error) {
  if (error.code !== "ENOENT") console.warn(`data/mint-requests.json ignored: ${error.message}`);
}
const mintHtml = mintRequests.length
  ? [
      '      <ul class="od-mint">',
      ...mintRequests.map(
        (entry) =>
          `        <li><span>${escapeHtml(entry.title)}</span><span>${count.format(entry.count)} ${entry.count === 1 ? "piece" : "pieces"}</span><span class="od-status">${escapeHtml(statusLabel[entry.status] ?? entry.status)}</span></li>`
      ),
      "      </ul>"
    ].join("\n")
  : "      <p>no requests.</p>";

const daoTemplate = await readFile(path.join(root, "src/dao.template.html"), "utf8");
await mkdir(path.join(publicDir, "dao"), { recursive: true });
await writeFile(
  path.join(publicDir, "dao/index.html"),
  daoTemplate
    .replaceAll("{{DAO_NAME}}", escapeHtml(dao.name))
    .replaceAll("{{DAO_STATUS}}", () => daoStatus)
    .replaceAll("{{MINT_REQUESTS}}", () => mintHtml)
    .replaceAll("{{NAV_EXTRA}}", navExtra)
);

// ---- /badge/: static page; the badge is computed in the browser by public/kit/office-badge.js ----
const badgeTemplate = await readFile(path.join(root, "src/badge.template.html"), "utf8");
await mkdir(path.join(publicDir, "badge"), { recursive: true });
await writeFile(path.join(publicDir, "badge/index.html"), badgeTemplate.replaceAll("{{NAV_EXTRA}}", navExtra));

// ---- /loom/: static page that embeds the officenoun thread from the Loom ----
const loomTemplate = await readFile(path.join(root, "src/loom.template.html"), "utf8");
await mkdir(path.join(publicDir, "loom"), { recursive: true });
await writeFile(path.join(publicDir, "loom/index.html"), loomTemplate.replaceAll("{{NAV_EXTRA}}", navExtra));

// ---- /bench/: static page; the scorecard is filled in the browser by public/kit/office-bench.js ----
const benchTemplate = await readFile(path.join(root, "src/bench.template.html"), "utf8");
await mkdir(path.join(publicDir, "bench"), { recursive: true });
await writeFile(path.join(publicDir, "bench/index.html"), benchTemplate.replaceAll("{{NAV_EXTRA}}", navExtra));

// ---- /desk/ and /charter/: rendered from config.desk and config.charter by scripts/desk-pages.mjs ----
for (const [name, render, block] of [["desk", renderDeskPage, config.desk], ["charter", renderCharterPage, config.charter]]) {
  const pageTemplate = await readFile(path.join(root, `src/${name}.template.html`), "utf8");
  await mkdir(path.join(publicDir, name), { recursive: true });
  await writeFile(path.join(publicDir, `${name}/index.html`), render(pageTemplate, block ?? {}, navExtra));
}

if (dashboardTemplate !== null) {
  await mkdir(path.join(publicDir, "dashboard"), { recursive: true });
  await writeFile(
    path.join(publicDir, "dashboard/index.html"),
    dashboardTemplate
      .replaceAll("{{DAY_NUMBER}}", String(today))
      .replaceAll("{{WALLET}}", escapeHtml(config.wallet))
      .replaceAll("{{SITE_URL}}", escapeHtml(config.siteUrl))
      .replaceAll("{{NAV_EXTRA}}", "")
  );
}

await rm(distDir, { force: true, recursive: true });
await mkdir(distDir, { recursive: true });
await cp(publicDir, distDir, { recursive: true });
await writeFile(path.join(root, "index.html"), renderPage("./public", "./public/kit/index.html", "./public/today/index.html", "./public/org/index.html", "./public/dao/index.html", "./public/dashboard/index.html", "./public/badge/index.html"));
await writeFile(path.join(distDir, "index.html"), renderPage(".", "./kit/", "./today/", "./org/", "./dao/", "./dashboard/", "./badge/"));

console.log(`Day ${today}: ${noun.description}.`);
console.log(`Built ${files.length} daybook ${files.length === 1 ? "entry" : "entries"} into index.html and dist/index.html`);
