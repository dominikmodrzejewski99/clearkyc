import { Component, ElementRef, OnDestroy, ViewChild, effect, input, signal } from '@angular/core';

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  templateUrl: './pdf-viewer.component.html',
  styleUrl: './pdf-viewer.component.scss',
})
export class PdfViewerComponent implements OnDestroy {
  readonly pdfBlob = input<Blob | null>(null);
  readonly targetPage = input<number>(1);

  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pdfDocument = signal<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentRenderTask: any = null;

  constructor() {
    effect(() => {
      const blob = this.pdfBlob();
      if (blob) this.loadPdf(blob);
    });

    // Fires whenever pdfDocument or targetPage changes — single render path
    effect(() => {
      const page = this.targetPage();
      const doc = this.pdfDocument();
      if (doc) this.renderPage(doc, page);
    });
  }

  ngOnDestroy(): void {
    this.currentRenderTask?.cancel();
    this.pdfDocument()?.destroy();
  }

  private async loadPdf(blob: Blob): Promise<void> {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();

    const arrayBuffer = await blob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const doc = await loadingTask.promise;
    // Setting pdfDocument triggers the targetPage effect — no explicit renderPage call needed
    this.pdfDocument.set(doc);
  }

  private async renderPage(doc: any, pageNumber: number): Promise<void> {
    if (!this.canvasRef) return;

    if (this.currentRenderTask) {
      this.currentRenderTask.cancel();
      this.currentRenderTask = null;
    }

    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = this.canvasRef.nativeElement;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d')!;
    this.currentRenderTask = page.render({ canvasContext: context, viewport });
    try {
      await this.currentRenderTask.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') throw err;
    } finally {
      this.currentRenderTask = null;
    }
  }
}
