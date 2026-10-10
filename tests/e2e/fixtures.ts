import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';

const expectedFailures = new WeakMap<Page, Array<{ path: string; status: number }>>();

// Permit only the browser's resource-load diagnostic for an intentional API failure.
// Application console errors and every pageerror (including hydration) still fail.
export function expectHttpError(page: Page, path: string, status: number) {
  const allowed = expectedFailures.get(page) ?? [];
  allowed.push({ path, status });
  expectedFailures.set(page, allowed);
}

function watchBrowserErrors(context: BrowserContext, errors: string[]) {
    const watch = (page: Page) => {
      page.on('pageerror', error => errors.push(`pageerror ${page.url()}: ${error.message}`));
      page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        const location = message.location().url;
        const allowed = expectedFailures.get(page) ?? [];
        const isExpected = allowed.some(({ path, status }) => {
          try {
            return new URL(location).pathname === path &&
              text === `Failed to load resource: the server responded with a status of ${status} (${status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 500 ? 'Internal Server Error' : 'Bad Request'})`;
          } catch { return false; }
        });
        if (!isExpected) errors.push(`console ${location}: ${text}`);
      });
    };
    context.pages().forEach(watch);
    context.on('page', watch); // Includes both tabs in the cross-tab logout test.
    return () => context.off('page', watch);
}

export const test = base.extend<{ browserErrors: void; newActorPage: () => Promise<Page> }>({
  browserErrors: [async ({ context }, use) => {
    const errors: string[] = [];
    const stop = watchBrowserErrors(context, errors);
    await use();
    stop();
    expect(errors, 'Unexpected browser errors (including hydration)').toEqual([]);
  }, { auto: true }],
  // Independent cookies/storage for each employee, with the same error checks as
  // the default page. Raw browser.newContext() would escape the automatic fixture.
  newActorPage: async ({ browser, baseURL, ignoreHTTPSErrors }, provideActorPage) => {
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];
    await provideActorPage(async () => {
      const context = await browser.newContext({ baseURL, ignoreHTTPSErrors });
      contexts.push(context);
      watchBrowserErrors(context, errors);
      return context.newPage();
    });
    await Promise.all(contexts.map(context => context.close()));
    expect(errors, 'Unexpected employee browser errors (including hydration)').toEqual([]);
  },
});

export { expect };
