/*
 * Google Analytics 4: the consent banner, and the events worth having.
 *
 * Imported only when PUBLIC_GA_MEASUREMENT_ID is set — see the guarded import
 * at the bottom of src/pages/index.astro. gtag.js and the Consent Mode v2
 * defaults are already in place by the time this runs (the inline `<head>`
 * snippet), so everything here talks to window.gtag and assumes denied.
 */
import pluginStyles from 'vanilla-cookieconsent/dist/cookieconsent.css?inline';
import deskStyles from '../styles/consent.css?inline';
import * as CookieConsent from 'vanilla-cookieconsent';

const gtag = (...args: unknown[]) => window.gtag?.(...args);

// Injected rather than linked. Nothing renders this CSS until the banner
// exists, and the banner does not exist until this module has loaded, so a
// stylesheet in the `<head>` would only block the first paint of a page with no
// use for it yet. Concatenated in this order so consent.css — which is nothing
// but custom-property overrides — lands after the plugin's defaults.
const styles = document.createElement('style');
styles.textContent = pluginStyles + deskStyles;
document.head.append(styles);

/* ------------------------------------------------------------------ consent */

// The banner's analytics category is the only signal that ever moves.
// ad_storage, ad_user_data and ad_personalization were denied by default and
// stay there: this site runs no ads, so there is nothing to ask for.
const syncConsent = () => {
	gtag('consent', 'update', {
		analytics_storage: CookieConsent.acceptedCategory('analytics') ? 'granted' : 'denied',
	});
};

void CookieConsent.run({
	guiOptions: {
		consentModal: { layout: 'box', position: 'bottom left' },
		preferencesModal: { layout: 'box' },
	},
	categories: {
		necessary: { enabled: true, readOnly: true },
		analytics: {
			// Withdrawing consent takes GA4's cookies with it, rather than
			// leaving them to expire two years from now.
			autoClear: { cookies: [{ name: /^_ga/ }] },
		},
	},
	// onConsent covers both the first answer and every later page load that
	// restores it; onChange covers edits from the footer's Cookies link.
	onConsent: syncConsent,
	onChange: syncConsent,
	language: {
		default: 'en',
		translations: {
			en: {
				consentModal: {
					title: 'A word about cookies',
					description:
						'This page counts visits and which links get clicked, so we know whether it is doing its job. Nothing is stored until you say yes, and none of it goes anywhere near advertising.',
					acceptAllBtn: 'Accept',
					acceptNecessaryBtn: 'Decline',
					showPreferencesBtn: 'Manage',
				},
				preferencesModal: {
					title: 'Cookie preferences',
					acceptAllBtn: 'Accept all',
					acceptNecessaryBtn: 'Reject all',
					savePreferencesBtn: 'Save preferences',
					closeIconLabel: 'Close',
					sections: [
						{
							title: 'What this page measures',
							description:
								'The Desk itself never phones home — that is rather the point of hosting it yourself. This marketing page is the exception: it measures how people arrive and what they click, which is how we decide what to write here. Decline and it measures nothing.',
						},
						{
							title: 'Strictly necessary',
							description:
								'Remembers the choice you make here, so we stop asking on every visit. Always on.',
							linkedCategory: 'necessary',
						},
						{
							title: 'Analytics',
							description:
								'Google Analytics 4: page views, which call to action you followed, how far down the page you read. Turning this off later deletes what was stored.',
							linkedCategory: 'analytics',
							cookieTable: {
								headers: { name: 'Cookie', domain: 'Domain', desc: 'Description' },
								body: [
									{
										name: '_ga',
										domain: location.hostname,
										desc: 'Tells one visitor from another. Expires after two years.',
									},
									{
										name: '_ga_*',
										domain: location.hostname,
										desc: 'Holds the session state for this GA4 property. Expires after two years.',
									},
								],
							},
						},
					],
				},
			},
		},
	},
});

/* ------------------------------------------------------------------- events */

/*
 * One delegated listener for every outbound link, driven by the data-cta and
 * data-placement attributes in index.astro — cheaper than wiring a dozen
 * handlers, and it survives someone adding a thirteenth link.
 *
 *   cta:       install_guide | live_demo | github | docs
 *   placement: nav | hero | features | selfhost | footer_cta | footer | mobile_menu
 *
 * The docs links are many and all land on the same origin, so they share one
 * cta and carry the page they point at instead.
 */
document.addEventListener('click', (event) => {
	const target = event.target;
	if (!(target instanceof Element)) return;

	const link = target.closest<HTMLAnchorElement>('a[data-cta]');
	if (!link) return;

	const cta = link.dataset.cta;
	gtag('event', 'cta_click', {
		cta,
		placement: link.dataset.placement,
		...(cta === 'docs' ? { doc_path: new URL(link.href).pathname } : {}),
	});
});

/*
 * Scroll depth. The page argues its case from top to bottom, so knowing how
 * many readers reach the self-hosting section — and how many bounce off the
 * hero — is the difference between editing and guessing.
 */
const milestones = [25, 50, 75, 100];
let reached = 0;
let queued = false;

const measure = () => {
	queued = false;

	const scrollable = document.documentElement.scrollHeight - window.innerHeight;
	if (scrollable <= 0) return;

	// Rounded: scrollY comes back fractional on scaled displays, so at the true
	// bottom of the page this lands on 99.99 and the last milestone never fires.
	const percent = Math.round(((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100);
	while (reached < milestones.length && percent >= milestones[reached]) {
		gtag('event', 'scroll_depth', { percent: milestones[reached] });
		reached++;
	}

	if (reached === milestones.length) window.removeEventListener('scroll', onScroll);
};

const onScroll = () => {
	if (queued) return;
	queued = true;
	requestAnimationFrame(measure);
};

window.addEventListener('scroll', onScroll, { passive: true });
measure();
