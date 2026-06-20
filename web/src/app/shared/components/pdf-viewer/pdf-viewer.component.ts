import { Component, effect, inject, input, signal } from '@angular/core';
import {
  NgxExtendedPdfViewerModule,
  NgxExtendedPdfViewerService,
  PagesLoadedEvent,
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
  private findTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      this.pdfBlob();
      this.isReady.set(false);
    });

    // When a citation is clicked: navigate to the citation's page first (scrollPageIntoView),
    // then highlight all occurrences of the text. dontScrollIntoView: true is intentional —
    // without it, find() jumps to the first occurrence in the entire document which may be a
    // different field's citation on a different page, causing wrong-position scrolling when
    // the same text is cited by multiple fields.
    effect(() => {
      if (!this.isReady()) return;
      const q = this.activeQuote();

      if (this.findTimer !== null) {
        clearTimeout(this.findTimer);
        this.findTimer = null;
      }

      if (q?.quote) {
        if (q.page > 0) {
          this.pdfService.scrollPageIntoView(q.page);
        }
        const query = normalizeQuery(q.quote);
        this.findTimer = setTimeout(() => {
          this.findTimer = null;
          this.pdfService.find(query, {
            highlightAll: true,
            matchDiacritics: false,
            dontScrollIntoView: true,
          });
        }, 300);
      } else {
        this.pdfService.find('');
      }
    });
  }

  protected onPagesLoaded(event: PagesLoadedEvent): void {
    this.pageCount.set(event.pagesCount);
    this.isReady.set(true);
  }
}
