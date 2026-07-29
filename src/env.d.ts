/// <reference types="astro/client" />

interface Window {
	/**
	 * Both are stood up by the inline Consent Mode snippet in the `<head>` of
	 * src/pages/index.astro, and only exist when PUBLIC_GA_MEASUREMENT_ID is set.
	 */
	dataLayer?: IArguments[];
	gtag?: (...args: unknown[]) => void;
}
