import { expect, test } from '@playwright/test';

const samplePdfs = [
  'public/demo/northgate-holdings-articles.pdf',
  'public/demo/meridian-retail-group.pdf',
];

test('batch processing risk: analyst uploads multiple PDFs and opens completed case', async ({ page }) => {
  let nextCase = 0;

  await page.route('**/api/cases', async route => {
    if (route.request().method() === 'POST') {
      nextCase += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `batch-case-${nextCase}`,
          status: 'CREATED',
          createdAt: new Date().toISOString(),
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/api/cases/*/analysis', async route => {
    const caseId = route.request().url().match(/cases\/([^/]+)\/analysis/)?.[1] ?? 'unknown';
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        `event: FieldExtracted\ndata: {"field":{"fieldName":"companyName","value":"Entity ${caseId}","citations":[]}}`,
        `event: AnalysisComplete\ndata: {"caseId":"${caseId}"}`,
        '',
      ].join('\n\n'),
    });
  });

  await page.route('**/api/cases/batch-case-1', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'batch-case-1',
      status: 'ANALYZED',
      entityName: 'Entity batch-case-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lockedAt: null,
      fields: [],
      red_flags: [],
      audit: null,
    }),
  }));
  await page.route('**/api/cases/batch-case-1/document', route => route.fulfill({
    status: 200,
    contentType: 'application/pdf',
    path: samplePdfs[0],
  }));

  await page.goto('/batch/new');
  await page.getByLabel(/Wybierz pliki PDF/).setInputFiles(samplePdfs);

  await expect(page.getByText('northgate-holdings-articles.pdf')).toBeVisible();
  await expect(page.getByText('meridian-retail-group.pdf')).toBeVisible();

  await page.getByRole('button', { name: 'Przetwórz wszystkie (2)' }).click();
  await expect(page).toHaveURL(/\/batch\/[^/]+$/);
  await expect(page.getByText('2/2 gotowych')).toBeVisible();

  const batchUrl = page.url().match(/\/batch\/[^/]+$/)?.[0];
  await page.getByRole('button', { name: 'Otwórz case' }).first().click();
  await expect(page).toHaveURL(/\/cases\/batch-case-1\?batchId=[^&]+$/);
  const closeOnboarding = page.getByRole('button', { name: 'Zamknij przewodnik' });
  if (await closeOnboarding.isVisible()) {
    await closeOnboarding.click();
  }
  await page.getByRole('link', { name: 'Wróć do listy spraw' }).click();
  await expect(page).toHaveURL(new RegExp(`${batchUrl}$`));
});

test('batch upload risk: invalid type and file-count overflow show validation errors', async ({ page }) => {
  await page.goto('/batch/new');
  const chooser = page.getByLabel(/Wybierz pliki PDF/);

  await chooser.setInputFiles({
    name: 'not-a-pdf.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.getByRole('alert')).toContainText('not-a-pdf.docx: Nie jest plikiem PDF');

  await chooser.setInputFiles(Array.from({ length: 21 }, (_, index) => ({
    name: `document-${index + 1}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4'),
  })));
  await expect(page.getByRole('alert')).toContainText('Maksymalnie 20 plików na raz');
});
