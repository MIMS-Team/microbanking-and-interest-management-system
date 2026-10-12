import { test, expect } from './fixtures';

for (const form of [
  { path: '/login', submit: 'Continue with 2FA' },
  { path: '/passwordreset', submit: 'Send Recovery OTP' },
]) {
  test(`${form.path} preserves typed credentials after delayed hydration`, async ({ page }) => {
    let releaseScripts!: () => void;
    const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
    // Keep the server HTML visible while the browser waits for React's scripts.
    await page.route('**/_next/static/**/*.js', async route => {
      await scriptsReady;
      await route.continue();
    });

    try {
      await page.goto(form.path, { waitUntil: 'commit' });
      const email = page.locator('input[type="email"]');
      const submit = page.getByRole('button', { name: form.submit });
      await expect(email).toBeVisible();
      await expect(email).toBeDisabled();
      await expect(submit).toBeDisabled();
      if (form.path === '/login') await expect(page.locator('input[type="password"]')).toBeDisabled();

      releaseScripts();
      await expect(email).toBeEditable();
      await expect(submit).toBeEnabled();
      await email.fill('agent@example.test');
      // Blur triggers React's change handling as well as the browser's input event.
      await submit.focus();
      await expect(email).toHaveValue('agent@example.test');
      if (form.path === '/login') {
        const password = page.locator('input[type="password"]');
        await password.fill('Agent@2026!');
        await submit.focus();
        await expect(password).toHaveValue('Agent@2026!');
      }
    } finally {
      releaseScripts();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
