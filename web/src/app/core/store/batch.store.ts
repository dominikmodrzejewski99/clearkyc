import { computed, Injectable, signal } from '@angular/core';
import { BatchItem, BatchItemStatus, BatchManifest, BatchStatus, BatchSummary } from '../models/batch.models';

const STORAGE_PREFIX = 'clearkyc-batch-';
const ACTIVE_BATCH_KEY = 'clearkyc-active-batch';

@Injectable({ providedIn: 'root' })
export class BatchStore {
  readonly batchId = signal<string | null>(null);
  readonly items = signal<BatchItem[]>([]);
  readonly batchStatus = signal<BatchStatus>('selecting');

  readonly summary = computed<BatchSummary>(() => {
    const all = this.items();
    return {
      total: all.length,
      done: all.filter(i => i.status === 'done').length,
      error: all.filter(i => i.status === 'error').length,
      analyzing: all.filter(i => i.status === 'analyzing').length,
      queued: all.filter(i => i.status === 'queued').length,
    };
  });

  readonly isComplete = computed(() => {
    const all = this.items();
    return all.length > 0 && all.every(i => i.status === 'done' || i.status === 'error');
  });

  initBatch(files: File[]): void {
    const batchId = crypto.randomUUID();
    const items: BatchItem[] = files.map(file => ({
      file,
      fileName: file.name,
      fileSize: file.size,
      caseId: null,
      status: 'pending' as BatchItemStatus,
      entityName: null,
      error: null,
      fieldsCount: 0,
    }));

    this.batchId.set(batchId);
    this.items.set(items);
    this.batchStatus.set('selecting');
    this.persistManifest();
    this.setActiveBatch(batchId);
  }

  updateItem(index: number, patch: Partial<BatchItem>): void {
    this.items.update(items => {
      const updated = [...items];
      if (index >= 0 && index < updated.length) {
        updated[index] = { ...updated[index], ...patch };
      }
      return updated;
    });
  }

  setCaseId(index: number, caseId: string): void {
    this.updateItem(index, { caseId });
    this.persistManifest();
  }

  markItemStatus(index: number, status: BatchItemStatus, error?: string): void {
    this.updateItem(index, { status, error: error ?? null });
  }

  incrementFields(index: number): void {
    this.items.update(items => {
      const updated = [...items];
      if (index >= 0 && index < updated.length) {
        updated[index] = { ...updated[index], fieldsCount: updated[index].fieldsCount + 1 };
      }
      return updated;
    });
  }

  setEntityName(index: number, entityName: string): void {
    this.updateItem(index, { entityName });
  }

  persistManifest(): void {
    const id = this.batchId();
    if (!id) return;

    const manifest: BatchManifest = {
      batchId: id,
      caseIds: this.items()
        .map(i => i.caseId)
        .filter((caseId): caseId is string => caseId !== null),
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(manifest));
  }

  loadManifest(batchId: string): BatchManifest | null {
    const raw = localStorage.getItem(STORAGE_PREFIX + batchId);
    if (!raw) return null;

    try {
      const manifest = JSON.parse(raw) as BatchManifest;
      this.batchId.set(manifest.batchId);
      return manifest;
    } catch {
      return null;
    }
  }

  getActiveBatchId(): string | null {
    return localStorage.getItem(ACTIVE_BATCH_KEY);
  }

  private setActiveBatch(batchId: string): void {
    localStorage.setItem(ACTIVE_BATCH_KEY, batchId);
  }

  clearActiveBatch(): void {
    localStorage.removeItem(ACTIVE_BATCH_KEY);
  }

  reset(): void {
    const id = this.batchId();
    if (id) {
      localStorage.removeItem(STORAGE_PREFIX + id);
    }
    this.clearActiveBatch();
    this.batchId.set(null);
    this.items.set([]);
    this.batchStatus.set('selecting');
  }
}
