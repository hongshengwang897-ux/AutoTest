/**
 * Injection script injected into the target page via Playwright.
 * Creates a floating "识别" button and scans DOM on click.
 * The report URL is patched in at injection time.
 */
export declare function buildInjectionScript(reportEndpoint: string): string;
