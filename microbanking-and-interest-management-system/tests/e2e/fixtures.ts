import { test as base, expect, type Page } from '@playwright/test';

export const test = base.extend<{ browserErrors: void }>({
  browserErrors: [async ({ context }, use, testInfo) => {
    const errors: string[] = [];
    const watched = new Set<Page>();
    const watch = (page: Page) => {
      if (watched.has(page)) return;
      watched.add(page);
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack || error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        // Negative auth scenarios intentionally return these HTTP errors. Only
        // Chromium's exact resource-load diagnostic on our auth APIs is allowed.
        // React/hydration errors and all uncaught exceptions always fail.
        const status = /^Failed to load resource: the server responded with a status of (\d+) \([^)]+\)$/.exec(message.text())?.[1];
        const path = message.location().url ? new URL(message.location().url).pathname : '';
        const expectedHttpError =
          (status === '401' && ['/api/auth/login', '/api/auth/otp', '/api/auth/password-reset/confirm', '/api/users'].includes(path)) ||
          (status === '403' && path === '/api/users') ||
          (status === '500' && path === '/api/auth/logout'); // Deliberately mocked transient logout failure.
        if (!expectedHttpError) errors.push(`console: ${message.text()}`);
      });
    };
    context.on('page', watch);
    for (const page of context.pages()) watch(page);
    await use();
    context.removeListener('page', watch);
    if (errors.length) await testInfo.attach('browser-errors', { body: errors.join('\n'), contentType: 'text/plain' });
    expect(errors, 'Unexpected browser errors, including hydration errors, on any tab').toEqual([]);
  }, { auto: true }],
});

export { expect };
