/**
 * seed.spec.ts — exemplar dla testów E2E ClearKYC
 *
 * Risk: auth + routing boundary — autoryzowany analityk dociera do formularza
 * wgrywania pliku. Jeśli authGuard zablokuje dostęp lub Auth0 sesja wygaśnie,
 * analityk zobaczy redirect zamiast formularza (decyzje KYB niemożliwe).
 *
 * Bound to: test-plan.md (auth → authGuard → routing → rendered UI boundary)
 * Model on: seed-test-pattern.md z .claude/skills/10x-e2e/references/
 */

import { test, expect } from '@playwright/test';

// storageState jest skonfigurowany globalnie w playwright.config.ts —
// każdy test startuje z uwierzytelnionym użytkownikiem bez logowania przez UI.

test('authenticated analyst sees the PDF upload form on /cases/new', async ({ page }) => {
  // Setup: storageState z playwright.config.ts — brak logowania przez UI

  // Navigate: authGuard sprawdza token i przepuszcza dalej
  await page.goto('/cases/new');

  // Assert: formularz wgrywania renderuje się (nagłówek + przycisk uploadu)
  await expect(page.getByText('Wgraj dokument źródłowy')).toBeVisible();
  await expect(page.getByRole('button', { name: /Wgraj plik PDF/ })).toBeVisible();

  // No cleanup: read-only navigation — brak stanu do posprzątania
});
