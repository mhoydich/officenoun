# Office Noun

A one-page, CC0 daybook for [officenoun.xyz](https://officenoun.xyz). Plain HTML and CSS, generated from dated Markdown files.

## Add a readout

1. Add `readouts/YYYY-MM-DD.md`.
2. Write normal Markdown. The filename becomes the date heading.
3. Commit and push. Cloudflare Pages rebuilds the site automatically.

Files are sorted newest-first. The daily office characters live in `public/nouns/`; the roster and accessible descriptions are in `src/index.template.html`. Everyone sees the same Noun for a given office day, and the character advances with the day counter. Change the first office day in `site.config.json`; that date displays as Day 1. The small inline script keeps both the character and day number current between builds.

## Build locally

Requires Node 20 or newer. There are no runtime dependencies.

```sh
npm run build
npm run serve
```

Open <http://localhost:8788>. After building, `index.html` also opens directly in Chrome without a local server; `src/index.template.html` is the unrendered source template.

## Deploy with Cloudflare Pages + GitHub

1. Push this repository to GitHub.
2. In Cloudflare, open **Workers & Pages → Create → Pages → Connect to Git** and select the repository.
3. Use production branch `main`, build command `npm run build`, and output directory `dist`. No framework preset or environment variables are needed.
4. Deploy. Future pushes create automatic deployments; other branches get preview deployments.

`wrangler.jsonc` records the Pages project name and build output in source control.

## Point officenoun.xyz at Pages

The apex domain must be an active zone in the same Cloudflare account as the Pages project.

1. If the domain is not already on Cloudflare DNS, add it as a zone and replace the registrar nameservers with the two account-specific nameservers Cloudflare assigns.
2. In the Pages project, open **Custom domains → Set up a domain** and add `officenoun.xyz` before changing DNS.
3. Cloudflare will create this proxied, flattened apex record:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `@` | `officenoun.pages.dev` | Proxied |

For optional `www`, first add `www.officenoun.xyz` under Pages custom domains, then use:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `www` | `officenoun.pages.dev` | Proxied |

Do not add an A or AAAA record for the Pages site, and do not create the CNAME without first associating the hostname in Pages.

## License

CC0. Copy the format.
