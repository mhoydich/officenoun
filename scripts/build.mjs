import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readoutsDir = path.join(root, "readouts");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

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
    if (paragraph.length) blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
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

function todayInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
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

const files = (await readdir(readoutsDir))
  .filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))
  .sort((a, b) => b.localeCompare(a));
if (!files.length) throw new Error("Add at least one YYYY-MM-DD.md file to readouts/");

const entries = await Promise.all(
  files.map(async (file) => {
    const date = file.slice(0, 10);
    const markdown = await readFile(path.join(readoutsDir, file), "utf8");
    return [
      '        <article class="entry">',
      `          <h2 class="entry-date"><time datetime="${date}">${dateLabel(date)}</time></h2>`,
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

const template = await readFile(path.join(root, "src/index.template.html"), "utf8");
const html = template
  .replace("{{START_DATE}}", config.startDate)
  .replace("{{DAY_NUMBER}}", String(dayNumber(config.startDate, todayInTimeZone(config.timeZone))))
  .replace("{{REPO_URL}}", escapeHtml(config.repoUrl))
  .replace("{{X_URL}}", escapeHtml(config.xUrl))
  .replace("{{ENTRIES}}", entries.join("\n\n"));

await rm(distDir, { force: true, recursive: true });
await mkdir(distDir, { recursive: true });
await cp(publicDir, distDir, { recursive: true });
await writeFile(path.join(distDir, "index.html"), html);

console.log(`Built ${files.length} daybook ${files.length === 1 ? "entry" : "entries"} into dist/index.html`);
