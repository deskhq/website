// @ts-check
import { defineConfig } from 'astro/config';

// Public URL the apex marketing site is served from. Used for the canonical
// link and the social-card (Open Graph / Twitter) URLs in src/pages/index.astro.
// The documentation lives on its own origin at https://docs.thedeskhq.app.
export default defineConfig({
	site: 'https://thedeskhq.app',
	// The whole site is two pages' worth of hand-written CSS. Inlining it keeps
	// the first render off a second round trip; Astro's default only inlines
	// sheets under 4 KB, and this one sits just over the line.
	build: { inlineStylesheets: 'always' },
});
