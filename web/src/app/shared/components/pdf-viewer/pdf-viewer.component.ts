import { Component, effect, inject, input, signal } from '@angular/core';
import {
  NgxExtendedPdfViewerModule,
  NgxExtendedPdfViewerService,
  PagesLoadedEvent,
  PageRenderedEvent,
} from 'ngx-extended-pdf-viewer';
import { ActiveCitation } from '../../../core/models/extraction.models';

const MAX_QUERY_LEN = 80;

function normalizeQuery(raw: string): string {
  return raw
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[""''„"]/g, '"')
    .replace(/[–—]/g, '-')
    .trim()
    .slice(0, MAX_QUERY_LEN)
    .trim();
}

@Component({
  selector: 'app-pdf-viewer',
  imports: [NgxExtendedPdfViewerModule],
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss',
})
export class PdfViewerComponent {
  readonly pdfBlob = input<Blob | null>(null);
  readonly targetPage = input<number>(1);
  readonly activeQuote = input<ActiveCitation | null>(null);

  private readonly pdfService = inject(NgxExtendedPdfViewerService);

  readonly pageCount = signal<number>(0);
  private readonly isReady = signal(false);
  private pendingFind: { page: number; query: string } | null = null;

  constructor() {
    effect(() => {
      this.pdfBlob();
      this.isReady.set(false);
      this.pendingFind = null;
    });

    // Page navigation itself is driven entirely by the template's [page]="targetPage()"
    // binding (targetPage mirrors the same citation's page number). This effect only
    // handles highlighting: dontScrollIntoView is intentional — without it, find() jumps
    // to the first occurrence in the whole document, which may be a different field's
    // citation on a different page, causing wrong-position scrolling when the same text
    // is cited by multiple fields.
    //
    // A page far from the current viewport is virtualized — its text layer doesn't exist
    // in the DOM until pdf.js actually renders it, which can take longer than any fixed
    // delay for large jumps. So: highlight immediately if the target page's text layer is
    // already in the DOM, otherwise defer until the (pageRendered) event confirms it.
    effect(() => {
      if (!this.isReady()) return;
      const q = this.activeQuote();
      this.pendingFind = null;

      if (!q?.quote) {
        this.pdfService.find('');
        return;
      }

      const query = normalizeQuery(q.quote);
      if (q.page > 0 && !this.isTextLayerRendered(q.page)) {
        this.pendingFind = { page: q.page, query };
        return;
      }
      this.pdfService.find(query, {
        highlightAll: true,
        matchDiacritics: false,
        dontScrollIntoView: true,
      });
    });
  }

  private isTextLayerRendered(pageNumber: number): boolean {
    const layer = document.querySelector(
      `.page[data-page-number="${pageNumber}"] .textLayer`,
    );
    return !!layer && layer.childElementCount > 0;
  }

  protected onPagesLoaded(event: PagesLoadedEvent): void {
    this.pageCount.set(event.pagesCount);
    this.isReady.set(true);
  }

  protected onPageRendered(event: PageRenderedEvent): void {
    if (this.pendingFind?.page !== event.pageNumber) return;
    const { query } = this.pendingFind;
    this.pendingFind = null;
    this.pdfService.find(query, {
      highlightAll: true,
      matchDiacritics: false,
      dontScrollIntoView: true,
    });
  }
}
