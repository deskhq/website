#!/usr/bin/env node
// Pulls the product imagery and the design tokens out of deskhq/the-desk, so
// this site consumes the app's design instead of re-drawing it by hand.
//
//   node scripts/sync-from-upstream.mjs           # write the synced files
//   node scripts/sync-from-upstream.mjs --check   # exit 1 if anything is stale
//   node scripts/sync-from-upstream.mjs --ref v1.17.0
//
// The captures come from `bin/capture-shell` upstream, which photographs the
// real shell from the seeded demo workspace against a pinned clock, viewport
// and locale. We take them from the latest *release tag* rather than master, so
// the site advertises the build an operator can actually install.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = 'deskhq/the-desk';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SHELL_VARIANTS = ['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'];
const SHELL_DIR = join(ROOT, 'public', 'shell');
const TOKENS_FILE = join(ROOT, 'src', 'styles', 'tokens.css');

// index.astro's semantic aliases (--ink, --brass, --line, ...) read straight
// out of tokens.css, so they cannot drift. What is left is the hexes the page
// still has to spell out: SVG presentation attributes, which take no var(), and
// incidental shades deliberately left as literals — binding a marketing grey to
// an upstream *chart* token would drag unrelated palette changes onto the page.
//
// Every one of those that currently equals an upstream token is pinned here.
// `--check` fails when upstream moves any of them, so a retyped hex can never
// drift silently; whether to follow upstream stays a human decision at review.
// Where a value backs several tokens, it is pinned to the semantically primary
// one.
const PINNED_HEXES = [
	['#1d1a15', 'light', '--foreground'], // brand mark, SVG fill
	['#c9a35c', 'light', '--brass'], // brand mark, SVG fill
	['#b98e3f', 'light', '--brass-border'], // feature-demo icons, SVG stroke
	['#7d6023', 'light', '--chart-2'], // eyebrow mark, SVG fill
	['#f3efe4', 'light', '--primary-foreground'], // GitHub glyph, SVG fill
	['#b3ab97', 'light', '--chart-4'], // footer link chevrons + faint labels
	['#8b8370', 'light', '--chart-3'], // tertiary copy on dark sections
	['#e0dbcd', 'light', '--input'], // reaction pill border
	['#eeeade', 'light', '--secondary'], // scheduled-pill border
	['#f0ece0', 'light', '--muted'], // nav pill fill
	['#d8d2c2', 'light', '--chart-5'], // avatar-stack chip
	['#4a4436', 'light', '--demo-banner-foreground'], // dark-section divider
	['#9b937f', 'dark', '--chart-3'], // --faint, this page's tertiary text
	['#2e2a21', 'dark', '--border'], // dark-section hairline
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const refArg = args.includes('--ref') ? args[args.indexOf('--ref') + 1] : null;

/** Latest published release tag, so we track shipped builds and not master. */
async function latestReleaseTag() {
	const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
		headers: {
			accept: 'application/vnd.github+json',
			'user-agent': 'deskhq-website-sync',
			...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
		},
	});
	if (!res.ok) throw new Error(`GitHub API ${res.status} resolving the latest ${REPO} release`);
	return (await res.json()).tag_name;
}

async function fetchUpstream(ref, path) {
	const url = `https://raw.githubusercontent.com/${REPO}/${ref}/${path}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
	return res;
}

/**
 * Slice one brace-balanced rule body out of a stylesheet, matching `selector`
 * only at the start of a line so the nested `:root` inside the demo-banner
 * media query cannot shadow the real one.
 */
function extractBlock(css, selector) {
	const start = css.search(new RegExp(`^${selector}\\s*\\{`, 'm'));
	if (start === -1) throw new Error(`no top-level \`${selector}\` block in the upstream stylesheet`);
	let depth = 0;
	for (let i = css.indexOf('{', start); i < css.length; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}' && --depth === 0) {
			return css.slice(css.indexOf('{', start) + 1, i);
		}
	}
	throw new Error(`unbalanced braces in the upstream \`${selector}\` block`);
}

/** Custom properties of one block, comments stripped, declaration order kept. */
function parseTokens(body) {
	const tokens = new Map();
	for (const [, name, value] of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
		tokens.set(name, value.trim());
	}
	if (tokens.size === 0) throw new Error('parsed an upstream token block but found no custom properties');
	return tokens;
}

function renderTokens(ref, light, dark) {
	const emit = (tokens, prefix) =>
		[...tokens].map(([name, value]) => `\t--app-${prefix}${name.slice(2)}: ${value};`).join('\n');

	return `/*
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * The Desk's design tokens, lifted from ${REPO}'s resources/css/app.css
 * at ${ref}. Refresh with \`npm run sync:upstream\`; CI refreshes it on a
 * schedule and opens a PR when upstream moves.
 *
 * Upstream's dark palette lives behind a \`.dark\` class. This site is a single
 * light document with a few dark sections, so those values are re-exposed here
 * as \`--app-dark-*\` and can be used anywhere, no theme class required.
 */
:root {
	/* ${REPO} :root @ ${ref} */
${emit(light, '')}

	/* ${REPO} .dark @ ${ref} */
${emit(dark, 'dark-')}
}
`;
}

/** True when the file already holds exactly `content`. */
async function isCurrent(path, content) {
	if (!existsSync(path)) return false;
	const existing = await readFile(path);
	return Buffer.isBuffer(content) ? existing.equals(content) : existing.toString() === content;
}

async function main() {
	const ref = refArg ?? (await latestReleaseTag());
	console.log(`${check ? 'Checking against' : 'Syncing from'} ${REPO} ${ref}`);

	const stale = [];

	// --- shell captures -------------------------------------------------
	await mkdir(SHELL_DIR, { recursive: true });
	for (const variant of SHELL_VARIANTS) {
		const res = await fetchUpstream(ref, `resources/js/images/shell/${variant}.png`);
		const bytes = Buffer.from(await res.arrayBuffer());
		const dest = join(SHELL_DIR, `${variant}.png`);
		if (await isCurrent(dest, bytes)) {
			console.log(`  ok      public/shell/${variant}.png`);
			continue;
		}
		stale.push(`public/shell/${variant}.png`);
		if (!check) {
			await writeFile(dest, bytes);
			console.log(`  wrote   public/shell/${variant}.png (${(bytes.length / 1024).toFixed(0)} KB)`);
		} else {
			console.log(`  STALE   public/shell/${variant}.png`);
		}
	}

	// --- design tokens --------------------------------------------------
	const appCss = await (await fetchUpstream(ref, 'resources/css/app.css')).text();
	const light = parseTokens(extractBlock(appCss, ':root'));
	const dark = parseTokens(extractBlock(appCss, '\\.dark'));
	const tokensCss = renderTokens(ref, light, dark);

	if (await isCurrent(TOKENS_FILE, tokensCss)) {
		console.log('  ok      src/styles/tokens.css');
	} else {
		stale.push('src/styles/tokens.css');
		if (!check) {
			await mkdir(dirname(TOKENS_FILE), { recursive: true });
			await writeFile(TOKENS_FILE, tokensCss);
			console.log(`  wrote   src/styles/tokens.css (${light.size} light, ${dark.size} dark)`);
		} else {
			console.log('  STALE   src/styles/tokens.css');
		}
	}

	// --- hexes the page has to retype -----------------------------------
	const page = await readFile(join(ROOT, 'src', 'pages', 'index.astro'), 'utf8');
	const drifted = [];
	for (const [hex, theme, token] of PINNED_HEXES) {
		const upstream = (theme === 'dark' ? dark : light).get(token);
		if (upstream === undefined) {
			drifted.push(`${token} (${theme}) no longer exists upstream; ${hex} is used in index.astro`);
		} else if (upstream.toLowerCase() !== hex.toLowerCase()) {
			drifted.push(`${token} (${theme}) is now ${upstream} upstream, but index.astro still hard-codes ${hex}`);
		} else if (!page.includes(hex)) {
			drifted.push(`${hex} is pinned to ${token} (${theme}) but no longer appears in index.astro — drop it from PINNED_HEXES`);
		}
	}

	if (drifted.length) {
		console.error('\nPalette drift — hard-coded hexes no longer match upstream:');
		for (const line of drifted) console.error(`  - ${line}`);
	} else {
		console.log(`  ok      ${PINNED_HEXES.length} pinned hexes in index.astro match upstream`);
	}

	// Report the tag, whether anything moved, and any drift, so the workflow can
	// title the PR and surface the drift in its body. Written before the
	// `--check` exit so a failing check still explains itself.
	if (process.env.GITHUB_OUTPUT) {
		const { appendFile } = await import('node:fs/promises');
		// Pre-rendered so the workflow can drop it straight into the PR body —
		// GitHub Actions expressions cannot build a multi-line string.
		const drift = drifted.length
			? ['> [!WARNING]', '> Palette drift — `index.astro` no longer matches upstream:', '>']
					.concat(drifted.map((d) => `> - ${d}`))
					.join('\n')
			: '';
		await appendFile(
			process.env.GITHUB_OUTPUT,
			`tag=${ref}\nchanged=${stale.length > 0}\ndrift<<SYNC_EOF\n${drift}\nSYNC_EOF\n`,
		);
	}

	if (check && (stale.length || drifted.length)) {
		if (stale.length) {
			console.error(`\n${stale.length} file(s) stale against ${REPO} ${ref}:`);
			for (const f of stale) console.error(`  - ${f}`);
		}
		console.error('\nRun `npm run sync:upstream` and commit the result.');
		process.exit(1);
	}

	// Outside `--check`, drift is reported but does not abort: the captures still
	// need to land, and the PR is where a human should see the palette change.
	if (drifted.length) console.error('\nPalette drift reported above — update index.astro by hand.');
	console.log(stale.length ? `\n${stale.length} file(s) updated.` : '\nEverything already current.');
}

main().catch((err) => {
	console.error(`sync-from-upstream: ${err.message}`);
	process.exit(1);
});
