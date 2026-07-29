import { TestBed } from '@angular/core/testing';
import { BatchStore } from './batch.store';

function createMockFile(name: string, size = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

describe('BatchStore', () => {
  let store: BatchStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(BatchStore);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initBatch', () => {
    it('creates items with pending status from provided files', () => {
      const files = [createMockFile('doc1.pdf'), createMockFile('doc2.pdf', 2048)];
      store.initBatch(files);

      expect(store.batchId()).not.toBeNull();
      expect(store.items()).toHaveLength(2);
      expect(store.items()[0].fileName).toBe('doc1.pdf');
      expect(store.items()[0].fileSize).toBe(1024);
      expect(store.items()[0].status).toBe('pending');
      expect(store.items()[0].caseId).toBeNull();
      expect(store.items()[1].fileName).toBe('doc2.pdf');
      expect(store.items()[1].fileSize).toBe(2048);
    });

    it('generates a unique batchId', () => {
      store.initBatch([createMockFile('a.pdf')]);
      const id1 = store.batchId();
      store.reset();
      store.initBatch([createMockFile('b.pdf')]);
      const id2 = store.batchId();

      expect(id1).not.toBe(id2);
    });

    it('sets batchStatus to selecting', () => {
      store.initBatch([createMockFile('a.pdf')]);
      expect(store.batchStatus()).toBe('selecting');
    });

    it('persists manifest to localStorage', () => {
      store.initBatch([createMockFile('a.pdf')]);
      const id = store.batchId()!;
      const stored = localStorage.getItem(`clearkyc-batch-${id}`);
      expect(stored).not.toBeNull();
      const manifest = JSON.parse(stored!);
      expect(manifest.batchId).toBe(id);
      expect(manifest.caseIds).toEqual([]);
    });

    it('sets active batch pointer in localStorage', () => {
      store.initBatch([createMockFile('a.pdf')]);
      expect(localStorage.getItem('clearkyc-active-batch')).toBe(store.batchId());
    });
  });

  describe('updateItem', () => {
    it('updates an item at the given index', () => {
      store.initBatch([createMockFile('a.pdf'), createMockFile('b.pdf')]);
      store.updateItem(1, { status: 'uploading' });

      expect(store.items()[0].status).toBe('pending');
      expect(store.items()[1].status).toBe('uploading');
    });

    it('does nothing for out-of-bounds index', () => {
      store.initBatch([createMockFile('a.pdf')]);
      store.updateItem(5, { status: 'done' });

      expect(store.items()[0].status).toBe('pending');
    });
  });

  describe('setCaseId', () => {
    it('sets caseId on an item and persists manifest', () => {
      store.initBatch([createMockFile('a.pdf'), createMockFile('b.pdf')]);
      store.setCaseId(0, 'case-123');

      expect(store.items()[0].caseId).toBe('case-123');

      const id = store.batchId()!;
      const manifest = JSON.parse(localStorage.getItem(`clearkyc-batch-${id}`)!);
      expect(manifest.caseIds).toContain('case-123');
    });
  });

  describe('markItemStatus', () => {
    it('sets status on an item', () => {
      store.initBatch([createMockFile('a.pdf')]);
      store.markItemStatus(0, 'analyzing');

      expect(store.items()[0].status).toBe('analyzing');
      expect(store.items()[0].error).toBeNull();
    });

    it('sets status with error message', () => {
      store.initBatch([createMockFile('a.pdf')]);
      store.markItemStatus(0, 'error', 'Upload failed');

      expect(store.items()[0].status).toBe('error');
      expect(store.items()[0].error).toBe('Upload failed');
    });
  });

  describe('incrementFields', () => {
    it('increments fieldsCount for an item', () => {
      store.initBatch([createMockFile('a.pdf')]);
      store.incrementFields(0);
      store.incrementFields(0);

      expect(store.items()[0].fieldsCount).toBe(2);
    });
  });

  describe('setEntityName', () => {
    it('sets entity name on an item', () => {
      store.initBatch([createMockFile('a.pdf')]);
      store.setEntityName(0, 'Acme Corp');

      expect(store.items()[0].entityName).toBe('Acme Corp');
    });
  });

  describe('summary (computed)', () => {
    it('derives counts from item statuses', () => {
      store.initBatch([
        createMockFile('a.pdf'),
        createMockFile('b.pdf'),
        createMockFile('c.pdf'),
        createMockFile('d.pdf'),
        createMockFile('e.pdf'),
      ]);
      store.markItemStatus(0, 'done');
      store.markItemStatus(1, 'done');
      store.markItemStatus(2, 'error', 'fail');
      store.markItemStatus(3, 'analyzing');
      store.markItemStatus(4, 'queued');

      const s = store.summary();
      expect(s.total).toBe(5);
      expect(s.done).toBe(2);
      expect(s.error).toBe(1);
      expect(s.analyzing).toBe(1);
      expect(s.queued).toBe(1);
    });

    it('returns all zeros for empty batch', () => {
      store.initBatch([]);
      const s = store.summary();
      expect(s.total).toBe(0);
      expect(s.done).toBe(0);
    });
  });

  describe('isComplete (computed)', () => {
    it('returns true when all items are done or error', () => {
      store.initBatch([createMockFile('a.pdf'), createMockFile('b.pdf')]);
      store.markItemStatus(0, 'done');
      store.markItemStatus(1, 'error', 'fail');

      expect(store.isComplete()).toBe(true);
    });

    it('returns false when some items are still in progress', () => {
      store.initBatch([createMockFile('a.pdf'), createMockFile('b.pdf')]);
      store.markItemStatus(0, 'done');
      store.markItemStatus(1, 'analyzing');

      expect(store.isComplete()).toBe(false);
    });

    it('returns false for empty items', () => {
      store.initBatch([]);
      expect(store.isComplete()).toBe(false);
    });
  });

  describe('loadManifest', () => {
    it('restores batchId from localStorage', () => {
      store.initBatch([createMockFile('a.pdf')]);
      store.setCaseId(0, 'case-abc');
      const batchId = store.batchId()!;

      // Reset in-memory state
      store.batchId.set(null);
      store.items.set([]);

      const manifest = store.loadManifest(batchId);
      expect(manifest).not.toBeNull();
      expect(manifest!.batchId).toBe(batchId);
      expect(manifest!.caseIds).toContain('case-abc');
      expect(store.batchId()).toBe(batchId);
    });

    it('returns null for non-existent batchId', () => {
      const manifest = store.loadManifest('non-existent-id');
      expect(manifest).toBeNull();
    });

    it('returns null for corrupted localStorage data', () => {
      localStorage.setItem('clearkyc-batch-bad-id', 'not-valid-json{{{');
      const manifest = store.loadManifest('bad-id');
      expect(manifest).toBeNull();
    });
  });

  describe('getActiveBatchId', () => {
    it('returns the active batch id from localStorage', () => {
      store.initBatch([createMockFile('a.pdf')]);
      const id = store.batchId()!;

      expect(store.getActiveBatchId()).toBe(id);
    });

    it('returns null when no active batch', () => {
      expect(store.getActiveBatchId()).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears all state and localStorage', () => {
      store.initBatch([createMockFile('a.pdf')]);
      const id = store.batchId()!;

      store.reset();

      expect(store.batchId()).toBeNull();
      expect(store.items()).toEqual([]);
      expect(store.batchStatus()).toBe('selecting');
      expect(localStorage.getItem(`clearkyc-batch-${id}`)).toBeNull();
      expect(localStorage.getItem('clearkyc-active-batch')).toBeNull();
    });
  });
});
