import { Injectable, inject } from '@angular/core';
import { Subscription, from, mergeMap, tap, catchError, EMPTY, Observable } from 'rxjs';
import { CaseService } from './case.service';
import { ExtractionStreamService } from './extraction-stream.service';
import { PdfStorageService } from './pdf-storage.service';
import { BatchStore } from '../store/batch.store';
import { BatchItem } from '../models/batch.models';
import { CaseDetail, ExtractionEvent } from '../models/extraction.models';

interface AnalysisQueueItem {
  index: number;
  caseId: string;
  file: File;
}

@Injectable({ providedIn: 'root' })
export class BatchOrchestrationService {
  private readonly caseService = inject(CaseService);
  private readonly extractionStream = inject(ExtractionStreamService);
  private readonly pdfStorage = inject(PdfStorageService);
  private readonly batchStore = inject(BatchStore);

  readonly MAX_CONCURRENT = 3;

  private analysisSubscription: Subscription | null = null;
  private activeStreams = new Map<number, () => void>();
  private cancelled = new Set<number>();

  async startUpload(): Promise<void> {
    const items = this.batchStore.items();
    if (items.length === 0) return;

    this.batchStore.batchStatus.set('uploading');

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.file || item.status !== 'pending') continue;

      this.batchStore.markItemStatus(i, 'uploading');

      try {
        const response = await new Promise<{ id: string }>((resolve, reject) => {
          this.caseService.createCase(item.file!).subscribe({
            next: res => resolve(res),
            error: err => reject(err),
          });
        });

        this.batchStore.setCaseId(i, response.id);
        this.batchStore.markItemStatus(i, 'created');

        // Cache PDF in IndexedDB for potential retry after refresh
        await this.pdfStorage.save(response.id, item.file!);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        this.batchStore.markItemStatus(i, 'error', message);
      }
    }

    this.batchStore.persistManifest();
    this.startAnalysis();
  }

  startAnalysis(): void {
    this.batchStore.batchStatus.set('analyzing');
    this.cancelled.clear();

    // Mark created items as queued
    const items = this.batchStore.items();
    const queueItems: AnalysisQueueItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === 'created' && item.caseId && item.file) {
        this.batchStore.markItemStatus(i, 'queued');
        queueItems.push({ index: i, caseId: item.caseId, file: item.file });
      }
    }

    if (queueItems.length === 0) {
      this.checkCompletion();
      return;
    }

    this.analysisSubscription = from(queueItems).pipe(
      mergeMap(queueItem => this.analyzeOne(queueItem), this.MAX_CONCURRENT),
    ).subscribe({
      complete: () => this.checkCompletion(),
    });
  }

  cancelItem(index: number): void {
    this.cancelled.add(index);
    const cancelStream = this.activeStreams.get(index);
    if (cancelStream) {
      cancelStream();
      this.activeStreams.delete(index);
    }
    this.batchStore.markItemStatus(index, 'error', 'Anulowano');
  }

  retryItem(index: number): void {
    const items = this.batchStore.items();
    const item = items[index];
    if (!item || item.status !== 'error') return;
    if (!item.caseId || !item.file) return;

    this.cancelled.delete(index);
    this.batchStore.updateItem(index, { error: null, fieldsCount: 0, entityName: null });
    this.batchStore.markItemStatus(index, 'queued');

    // Start a single analysis for this item
    this.batchStore.batchStatus.set('analyzing');
    const sub = this.analyzeOne({ index, caseId: item.caseId, file: item.file }).subscribe({
      complete: () => this.checkCompletion(),
    });
    // Keep reference so dispose() can clean up
    this.analysisSubscription = sub;
  }

  cancelAll(): void {
    // Cancel all active streams
    for (const [index, cancelStream] of this.activeStreams) {
      cancelStream();
      this.batchStore.markItemStatus(index, 'error', 'Anulowano');
    }
    this.activeStreams.clear();

    // Mark all queued as cancelled
    const items = this.batchStore.items();
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'queued') {
        this.cancelled.add(i);
        this.batchStore.markItemStatus(i, 'error', 'Anulowano');
      }
    }

    // Tear down subscription
    this.analysisSubscription?.unsubscribe();
    this.analysisSubscription = null;
    this.checkCompletion();
  }

  async restoreBatch(batchId: string): Promise<boolean> {
    const manifest = this.batchStore.loadManifest(batchId);
    if (!manifest) return false;

    const items: BatchItem[] = [];

    for (const caseId of manifest.caseIds) {
      try {
        const detail = await new Promise<CaseDetail>((resolve, reject) => {
          this.caseService.getCase(caseId).subscribe({
            next: res => resolve(res),
            error: err => reject(err),
          });
        });

        const pdfBlob = await this.pdfStorage.load(caseId);

        const file = pdfBlob ? new File([pdfBlob], `${caseId}.pdf`, { type: 'application/pdf' }) : null;
        const derivedStatus = this.deriveStatus(detail);
        const needsRetry = derivedStatus === 'queued';

        items.push({
          file,
          fileName: `${detail.entityName ?? caseId}.pdf`,
          fileSize: 0,
          caseId,
          status: needsRetry ? 'error' : derivedStatus,
          entityName: detail.entityName ?? null,
          error: needsRetry
            ? file
              ? 'Analiza przerwana — ponów'
              : 'Plik niedostępny — prześlij ponownie'
            : null,
          fieldsCount: detail.fields?.length ?? 0,
        });
      } catch {
        items.push({
          file: null,
          fileName: `${caseId}.pdf`,
          fileSize: 0,
          caseId,
          status: 'error',
          entityName: null,
          error: 'Nie udało się pobrać danych sprawy',
          fieldsCount: 0,
        });
      }
    }

    this.batchStore.batchId.set(batchId);
    this.batchStore.items.set(items);
    this.batchStore.batchStatus.set(
      items.every(i => i.status === 'done' || i.status === 'error') ? 'completed' : 'analyzing'
    );

    return true;
  }

  dispose(): void {
    this.analysisSubscription?.unsubscribe();
    this.analysisSubscription = null;
    this.activeStreams.clear();
    this.cancelled.clear();
  }

  private analyzeOne(queueItem: AnalysisQueueItem): Observable<ExtractionEvent> {
    const { index, caseId, file } = queueItem;

    if (this.cancelled.has(index)) {
      return EMPTY;
    }

    return new Observable<ExtractionEvent>(subscriber => {
      this.batchStore.markItemStatus(index, 'analyzing');

      const streamSubscription = this.extractionStream.streamAnalysis(caseId, file).pipe(
        tap((event: ExtractionEvent) => this.handleEvent(index, event)),
        catchError(err => {
          if (!this.cancelled.has(index)) {
            const message = err instanceof Error ? err.message : 'Błąd analizy';
            this.batchStore.markItemStatus(index, 'error', message);
          }
          return EMPTY;
        }),
      ).subscribe(subscriber);

      if (!streamSubscription.closed) {
        this.activeStreams.set(index, () => subscriber.complete());
      }

      return () => {
        streamSubscription.unsubscribe();
        this.activeStreams.delete(index);
      };
    });
  }

  private handleEvent(index: number, event: ExtractionEvent): void {
    switch (event.type) {
      case 'FieldExtracted':
        this.batchStore.incrementFields(index);
        if (event.field.fieldName === 'companyName' || event.field.fieldName === 'entityName') {
          this.batchStore.setEntityName(index, event.field.value);
        }
        break;
      case 'AnalysisComplete':
        this.batchStore.markItemStatus(index, 'done');
        break;
      case 'AnalysisError':
        this.batchStore.markItemStatus(index, 'error', event.message);
        break;
      case 'RedFlagsFound':
        // Red flags are tracked per-case in case-detail, not in batch
        break;
    }
  }

  private checkCompletion(): void {
    if (this.batchStore.isComplete()) {
      this.batchStore.batchStatus.set('completed');
      this.batchStore.clearActiveBatch();
    }
  }

  private deriveStatus(detail: CaseDetail): BatchItem['status'] {
    switch (detail.status) {
      case 'CREATED': return 'queued';
      case 'ANALYZING': return 'queued';
      case 'ANALYZED': return 'done';
      case 'LOCKED': return 'done';
      default: return 'error';
    }
  }
}
