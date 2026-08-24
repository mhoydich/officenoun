# Office Noun

A one-page, CC0 daybook for [officenoun.xyz](https://officenoun.xyz). Plain HTML and CSS, generated from dated Markdown files.

## Add a readout

1. Add `readouts/YYYY-MM-DD.md`.
2. Write normal Markdown. The filename becomes the date heading.
3. Commit and push. GitHub Pages rebuilds the site automatically.

Files are sorted newest-first. The daily office characters live in `public/nouns/`; the roster and accessible descriptions are in `src/index.template.html`. Everyone sees the same Noun for a given office day, and the character advances with the day counter. The gallery keeps one card for every office day, newest-first. Change the first office day in `site.config.json`; that date displays as Day 1. The small inline script keeps the character, gallery, and day number current between builds.

## Build locally

Requires Node 20 or newer. There are no runtime dependencies.

```sh
npm run build
npm run serve
```

Open <http://localhost:8788>. After building, `index.html` also opens directly in Chrome without a local server; `src/index.template.html` is the unrendered source template.

## Deploy with GitHub Pages

The workflow in `.github/workflows/pages.yml` builds `dist/` and deploys it whenever `main` changes. It can also be run manually from the repository's Actions tab.

In **Settings → Pages**, set the publishing source to **GitHub Actions** and set the custom domain to `officenoun.xyz`.

## Point officenoun.xyz at GitHub Pages

Keep the domain on Namecheap DNS. Add the custom domain in GitHub before changing DNS, then replace the Namecheap parking record with these records:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `mhoydich.github.io` |

Keep the existing MX and SPF records if Namecheap email forwarding is in use. GitHub provisions HTTPS after the DNS records resolve; enable **Enforce HTTPS** in the Pages settings when it becomes available.

## License

CC0. Copy the format.
