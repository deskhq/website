# The Desk — website

The marketing landing page for [The Desk](https://github.com/deskhq/the-desk), a
self-hosted, open-source team chat app. Served from the apex,
[thedeskhq.app](https://thedeskhq.app), on Cloudflare Pages.

This is a single standalone [Astro](https://astro.build) page — the operator and
self-hosting documentation lives in its own project at
[docs.thedeskhq.app](https://docs.thedeskhq.app).

## Develop

Node is pinned in `.nvmrc` (22.16.0, matching Cloudflare's builder). With
[nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use
npm ci
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # preview the built site
```

## Product imagery and palette

Nothing on this page draws the app by hand. Both the screenshots and the colours
are synced out of [`deskhq/the-desk`](https://github.com/deskhq/the-desk), from
its latest **release tag** — so the site advertises the build an operator can
actually install, not `master`.

| File | Source |
| --- | --- |
| `public/shell/{desktop,mobile}-{light,dark}.png` | `resources/js/images/shell/` — produced upstream by `bin/capture-shell`, which photographs the real shell from the seeded demo workspace against a pinned clock, viewport and locale |
| `src/styles/tokens.css` | the `:root` and `.dark` blocks of `resources/css/app.css` |

Both are generated. **Do not edit them by hand** — the next sync overwrites
them. `index.astro` maps its own vocabulary (`--ink`, `--brass`, `--line`, ...)
onto the `--app-*` tokens in its `:root` block; change that mapping, not the
tokens.

### Refreshing by hand

```bash
npm run sync:upstream              # sync from the latest release tag
npm run sync:upstream -- --ref v1.17.0   # or from a specific ref
npm run sync:upstream:check        # exit 1 if anything is stale — no writes
```

Then rebuild and check the hero and the showcase at mobile and desktop widths.

### Automatically

`.github/workflows/sync-shell-captures.yml` runs the same script daily, and on
demand via **workflow_dispatch** (optionally against a specific ref). When the
bytes change it opens a PR titled with the upstream tag, so a redesign is
reviewed and deployed rather than silently swapped. The site can therefore lag a
redesign by at most one schedule interval.

The same workflow runs `--check` on pull requests. Besides staleness, that
catches two kinds of drift in `scripts/sync-from-upstream.mjs`:

- **Palette drift.** A handful of hexes cannot be expressed as a `var()` (SVG
  `fill`/`stroke` attributes) or are deliberately literal, and each is pinned in
  `PINNED_HEXES` against the upstream token it copies. If upstream moves one,
  the check fails and names it.
- **Locale drift.** The self-hosting section names the languages the interface
  ships in. `LOCALES` pins those against `lang/` upstream, so adding or removing
  a locale there fails the check until the copy follows. Two locales is two
  locales — the page must not round up.

## Analytics

The page reports to Google Analytics 4, behind a consent banner
([`vanilla-cookieconsent`](https://github.com/orestbida/cookieconsent), pinned)
wired to Google Consent Mode v2. Everything is driven by one environment
variable:

| Variable | Value |
| --- | --- |
| `PUBLIC_GA_MEASUREMENT_ID` | The GA4 measurement ID — GA4 → **Admin → Data streams → the web stream → Measurement ID**. Looks like `G-XXXXXXXXXX`. |

**Unset it and analytics does not exist.** No gtag.js, no consent banner, no
`Cookies` link in the footer, no extra bytes — the build is byte-for-byte the
dependency-free page it was before. That is the default for local dev, preview
branches and forks, so only production writes to the property. Set it in
Cloudflare Pages for the production environment only.

To exercise it locally, put it in `.env` (gitignored) or pass it inline:

```bash
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX npm run build && npm run preview
```

Consent starts at `denied` for all four Google signals before gtag.js is even
fetched, so the first ping is cookieless. Accepting flips `analytics_storage`
alone; the three `ad_*` signals stay denied permanently, because the site runs
no ads. Withdrawing consent — the **Cookies** link in the footer — clears the
`_ga*` cookies.

Beyond the automatic `page_view`, two custom events:

| Event | Parameters |
| --- | --- |
| `cta_click` | `cta` (`install_guide`, `live_demo`, `github`, `docs`), `placement` (`nav`, `hero`, `features`, `selfhost`, `footer_cta`, `footer`, `mobile_menu`), and `doc_path` on docs links |
| `scroll_depth` | `percent` — 25, 50, 75, 100 |

Both come from one delegated listener in `src/scripts/analytics.ts`, reading
`data-cta` / `data-placement` off the anchors. **Tagging a new outbound link is
two attributes; there is no handler to add.**

## Deploy

Cloudflare Pages builds `npm run build` and serves `dist/`. The production branch
is `master`; every push to it triggers a deploy. It needs
`PUBLIC_GA_MEASUREMENT_ID` in its environment — see [Analytics](#analytics).

## License

[MIT](./LICENSE)
