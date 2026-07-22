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

## Deploy

Cloudflare Pages builds `npm run build` and serves `dist/`. The production branch
is `master`; every push to it triggers a deploy.

## License

[MIT](./LICENSE)
