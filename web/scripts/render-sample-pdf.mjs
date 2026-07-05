// Jednorazowy skrypt: renderuje przykładowe dokumenty demo (HTML -> PDF)
// przez Chromium (Playwright), do wykorzystania na ekranie uploadu jako
// "Wypróbuj z przykładem". Uruchamiać ręcznie po edycji plików źródłowych:
//   node web/scripts/render-sample-pdf.mjs

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, copyFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const demoAssetsDir = join(repoRoot, 'demo-assets');
const publicDemoDir = join(repoRoot, 'web', 'public', 'demo');

const documents = [
  { html: 'northgate-holdings-articles.html', pdf: 'northgate-holdings-articles.pdf' },
  { html: 'meridian-retail-group.html', pdf: 'meridian-retail-group.pdf' },
  { html: 'bosphorus-trading-fze.html', pdf: 'bosphorus-trading-fze.pdf' },
];

mkdirSync(publicDemoDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage();
  for (const doc of documents) {
    const htmlPath = join(demoAssetsDir, doc.html);
    const pdfPath = join(demoAssetsDir, doc.pdf);
    await page.goto(`file://${htmlPath}`);
    await page.pdf({ path: pdfPath, format: 'A4' });
    copyFileSync(pdfPath, join(publicDemoDir, doc.pdf));
    console.log(`Rendered ${doc.html} -> ${doc.pdf}`);
  }
} finally {
  await browser.close();
}
