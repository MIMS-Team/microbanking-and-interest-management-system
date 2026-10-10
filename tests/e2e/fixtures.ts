import { test as base, expect, type Page } from '@playwright/test';

const expectedFailures = new WeakMap<Page, Array<{ path: string; status: number }>>();

// Permit only the browser's resource-load diagnostic for an intentional API failure.
// Application console errors and every pageerror (including hydration) still fail.
export function expectHttpError(page: Page, path: string, status: number) {
  const allowed = expectedFailures.get(page) ?? [];
  allowed.push({ path, status });
  expectedFailures.set(page, allowed);
}

export const test = base.extend<{ browserErrors: void }>({
  browserErrors: [async ({ context }, use) => {
    const errors: string[] = [];
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
    await use();
    context.off('page', watch);
    expect(errors, 'Unexpected browser errors (including hydration)').toEqual([]);
  }, { auto: true }],
});

export { expect };
