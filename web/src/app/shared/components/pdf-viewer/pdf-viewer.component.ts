import { Component, ElementRef, OnDestroy, ViewChild, effect, input, signal } from '@angular/core';
import { ActiveCitation } from '../../../core/models/extraction.models';

let pdfjsWorkerInitialized = false;

interface PdfjsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

@Component({
  selector: 'app-pdf-viewer',
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss',
})
export class PdfViewerComponent implements OnDestroy {
  readonly pdfBlob = input<Blob | null>(null);
  readonly targetPage = input<number>(1);
  readonly activeQuote = input<ActiveCitation | null>(null);

  @ViewChild('pdfViewer') private viewerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('pagesContainer') private pagesContainerRef!: ElementRef<HTMLDivElement>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pdfDocument = signal<any>(null);
  private pagesRendered = signal<boolean>(false);
  private renderGeneration = 0;
  private readonly RENDER_SCALE = 1.5;

  readonly pageCount = signal<number>(0);

  constructor() {
    effect(() => {
      const blob = this.pdfBlob();
      if (blob) {
        this.loadPdf(blob);
      } else {
        this.clearContainer();
        this.pagesRendered.set(false);
      }
    });

    // Scroll on initial load (pagesRendered true) or genuine page-number change
    effect(() => {
      const page = this.targetPage();
      if (this.pagesRendered()) {
        this.scrollToPage(page);
      }
    });

    // Citation badge click always produces a new activeQuote object → effect always fires
    effect(() => {
      const q = this.activeQuote();
      if (q && this.pdfDocument()) {
        this.scrollToPage(q.page);
        this.attemptHighlight(q);
      } else {
        this.clearAllHighlights();
      }
    });
  }

  // ngOnDestroy intentional: pdfjs PDFDocumentProxy requires explicit destroy()
  // calls that are not covered by takeUntilDestroyed (non-observable resources).
  ngOnDestroy(): void {
    this.renderGeneration++;
    this.pdfDocument()?.destroy();
  }

  private async loadPdf(blob: Blob): Promise<void> {
    this.pagesRendered.set(false);
    this.renderGeneration++;
    const generation = this.renderGeneration;

    const pdfjsLib = await import('pdfjs-dist');
    if (!pdfjsWorkerInitialized) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      pdfjsWorkerInitialized = true;
    }

    const arrayBuffer = await blob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const doc = await loadingTask.promise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (generation !== this.renderGeneration) { (doc as any).destroy(); return; }

    this.pdfDocument()?.destroy();
    this.pdfDocument.set(doc);
    await this.renderAllPages(doc, generation);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderAllPages(doc: any, generation: number): Promise<void> {
    if (!this.pagesContainerRef) return;
    const container = this.pagesContainerRef.nativeElement;
    container.innerHTML = '';

    for (let i = 1; i <= doc.numPages; i++) {
      if (generation !== this.renderGeneration) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-viewer__page-wrapper';
      wrapper.setAttribute('data-page', String(i));

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-viewer__canvas';

      const highlightLayer = document.createElement('div');
      highlightLayer.className = 'pdf-viewer__highlight-layer';

      wrapper.appendChild(canvas);
      wrapper.appendChild(highlightLayer);
      container.appendChild(wrapper);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let page: any;
      try {
        page = await doc.getPage(i);
      } catch {
        return; // doc destroyed mid-render
      }
      if (generation !== this.renderGeneration) return;

      const viewport = page.getViewport({ scale: this.RENDER_SCALE });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d')!;
      try {
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') throw err;
      }
    }

    if (generation !== this.renderGeneration) return;
    this.pagesRendered.set(true);
    this.pageCount.set(doc.numPages);
  }

  private scrollToPage(pageNumber: number): void {
    if (!this.pagesContainerRef || !this.viewerRef) return;
    const wrapper = this.pagesContainerRef.nativeElement.querySelector(
      `[data-page="${pageNumber}"]`,
    ) as HTMLElement | null;
    if (!wrapper) return;
    const scrollEl = this.viewerRef.nativeElement;
    const targetTop =
      wrapper.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
    scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' });
  }

  private async attemptHighlight(citation: ActiveCitation): Promise<void> {
    this.clearAllHighlights();
    if (!this.pdfDocument() || !this.pagesContainerRef) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = this.pdfDocument();
      const page = await doc.getPage(citation.page || 1);
      const viewport = page.getViewport({ scale: this.RENDER_SCALE });
      const textContent = await page.getTextContent();
      const items: PdfjsTextItem[] = textContent.items;

      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const joined = items.map(i => i.str).join(' ');
      if (!normalize(joined).includes(normalize(citation.quote))) return;

      const quoteWords = normalize(citation.quote).split(' ').filter(w => w.length > 2);
      const wrapper = this.pagesContainerRef.nativeElement.querySelector(`[data-page="${citation.page}"]`);
      const layer = wrapper?.querySelector('.pdf-viewer__highlight-layer') as HTMLDivElement | null;
      if (!layer) return;

      for (const item of items) {
        if (!item.str.trim()) continue;
        if (!quoteWords.some(w => normalize(item.str).includes(w))) continue;

        const [left, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const fontSizePDF = item.height || Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12;
        const heightCSS = fontSizePDF * this.RENDER_SCALE;
        const widthCSS = item.width * this.RENDER_SCALE;

        const mark = document.createElement('div');
        mark.className = 'pdf-viewer__highlight-mark';
        mark.style.left = `${left}px`;
        mark.style.top = `${baseline - heightCSS}px`;
        mark.style.width = `${Math.max(widthCSS, 4)}px`;
        mark.style.height = `${Math.max(heightCSS, 8)}px`;
        layer.appendChild(mark);
      }
    } catch {
      this.clearAllHighlights();
    }
  }

  private clearAllHighlights(): void {
    if (!this.pagesContainerRef) return;
    this.pagesContainerRef.nativeElement
      .querySelectorAll('.pdf-viewer__highlight-layer')
      .forEach(l => (l.innerHTML = ''));
  }

  private clearContainer(): void {
    if (this.pagesContainerRef) {
      this.pagesContainerRef.nativeElement.innerHTML = '';
    }
    this.pageCount.set(0);
  }
}
