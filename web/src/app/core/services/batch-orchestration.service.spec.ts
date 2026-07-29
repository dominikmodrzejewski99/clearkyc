import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { BatchOrchestrationService } from './batch-orchestration.service';
import { CaseService } from './case.service';
import { ExtractionStreamService } from './extraction-stream.service';
import { PdfStorageService } from './pdf-storage.service';
import { BatchStore } from '../store/batch.store';
import { ExtractionEvent } from '../models/extraction.models';

function createMockFile(name: string, size = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

describe('BatchOrchestrationService', () => {
  let service: BatchOrchestrationService;
  let batchStore: BatchStore;
  let caseServiceMock: { createCase: ReturnType<typeof vi.fn>; getCase: ReturnType<typeof vi.fn> };
  let extractionStreamMock: { streamAnalysis: ReturnType<typeof vi.fn> };
  let pdfStorageMock: { save: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();

    caseServiceMock = {
      createCase: vi.fn(),
      getCase: vi.fn(),
    };
    extractionStreamMock = {
      streamAnalysis: vi.fn(),
    };
    pdfStorageMock = {
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(null),
    };

    TestBed.configureTestingModule({
      providers: [
        BatchOrchestrationService,
        BatchStore,
        { provide: CaseService, useValue: caseServiceMock },
        { provide: ExtractionStreamService, useValue: extractionStreamMock },
        { provide: PdfStorageService, useValue: pdfStorageMock },
      ],
    });

    service = TestBed.inject(BatchOrchestrationService);
    batchStore = TestBed.inject(BatchStore);
  });

  afterEach(() => {
    service.dispose();
    localStorage.clear();
  });

  describe('startUpload', () => {
    it('uploads each file sequentially and creates cases', async () => {
      const files = [createMockFile('a.pdf'), createMockFile('b.pdf')];
      batchStore.initBatch(files);

      caseServiceMock.createCase
        .mockReturnValueOnce(of({ id: 'case-1', status: 'CREATED', createdAt: '2026-01-01' }))
        .mockReturnValueOnce(of({ id: 'case-2', status: 'CREATED', createdAt: '2026-01-01' }));

      // Mock streamAnalysis to complete immediately (startUpload calls startAnalysis)
      extractionStreamMock.streamAnalysis.mockReturnValue(of(
        { type: 'AnalysisComplete', caseId: 'case-1' } as ExtractionEvent,
      ));

      await service.startUpload();

      expect(caseServiceMock.createCase).toHaveBeenCalledTimes(2);
      expect(batchStore.items()[0].caseId).toBe('case-1');
      expect(batchStore.items()[1].caseId).toBe('case-2');
    });

    it('marks failed uploads as error but continues with remaining files', async () => {
      const files = [createMockFile('a.pdf'), createMockFile('b.pdf'), createMockFile('c.pdf')];
      batchStore.initBatch(files);

      caseServiceMock.createCase
        .mockReturnValueOnce(of({ id: 'case-1', status: 'CREATED', createdAt: '2026-01-01' }))
        .mockReturnValueOnce(throwError(() => new Error('Network error')))
        .mockReturnValueOnce(of({ id: 'case-3', status: 'CREATED', createdAt: '2026-01-01' }));

      extractionStreamMock.streamAnalysis.mockReturnValue(of(
        { type: 'AnalysisComplete', caseId: 'x' } as ExtractionEvent,
      ));

      await service.startUpload();

      expect(batchStore.items()[0].caseId).toBe('case-1');
      expect(batchStore.items()[0].status).not.toBe('error');
      expect(batchStore.items()[1].status).toBe('error');
      expect(batchStore.items()[1].error).toBe('Network error');
      expect(batchStore.items()[2].caseId).toBe('case-3');
    });

    it('saves PDF to IndexedDB after successful upload', async () => {
      const files = [createMockFile('a.pdf')];
      batchStore.initBatch(files);

      caseServiceMock.createCase.mockReturnValue(of({ id: 'case-1', status: 'CREATED', createdAt: '2026-01-01' }));
      extractionStreamMock.streamAnalysis.mockReturnValue(of(
        { type: 'AnalysisComplete', caseId: 'case-1' } as ExtractionEvent,
      ));

      await service.startUpload();

      expect(pdfStorageMock.save).toHaveBeenCalledWith('case-1', files[0]);
    });

    it('sets batchStatus to uploading during upload phase', async () => {
      const files = [createMockFile('a.pdf')];
      batchStore.initBatch(files);

      let statusDuringUpload: string | null = null;
      caseServiceMock.createCase.mockImplementation(() => {
        statusDuringUpload = batchStore.batchStatus();
        return of({ id: 'case-1', status: 'CREATED', createdAt: '2026-01-01' });
      });
      extractionStreamMock.streamAnalysis.mockReturnValue(of(
        { type: 'AnalysisComplete', caseId: 'case-1' } as ExtractionEvent,
      ));

      await service.startUpload();

      expect(statusDuringUpload).toBe('uploading');
    });
  });

  describe('startAnalysis', () => {
    it('respects MAX_CONCURRENT limit', () => {
      const files = [
        createMockFile('a.pdf'),
        createMockFile('b.pdf'),
        createMockFile('c.pdf'),
        createMockFile('d.pdf'),
        createMockFile('e.pdf'),
      ];
      batchStore.initBatch(files);

      // Set all items as 'created' with caseIds
      for (let i = 0; i < 5; i++) {
        batchStore.setCaseId(i, `case-${i}`);
        batchStore.markItemStatus(i, 'created');
      }

      // Each stream never completes — stays open
      const subjects: Subject<ExtractionEvent>[] = [];
      extractionStreamMock.streamAnalysis.mockImplementation(() => {
        const s = new Subject<ExtractionEvent>();
        subjects.push(s);
        return s.asObservable();
      });

      service.startAnalysis();

      // Only MAX_CONCURRENT (3) should have been started
      expect(extractionStreamMock.streamAnalysis).toHaveBeenCalledTimes(3);
      expect(batchStore.items()[0].status).toBe('analyzing');
      expect(batchStore.items()[1].status).toBe('analyzing');
      expect(batchStore.items()[2].status).toBe('analyzing');
      // Items 3,4 should still be queued (waiting for slot)
      expect(batchStore.items()[3].status).toBe('queued');
      expect(batchStore.items()[4].status).toBe('queued');

      // Complete first stream → 4th should start
      subjects[0].next({ type: 'AnalysisComplete', caseId: 'case-0' });
      subjects[0].complete();

      expect(extractionStreamMock.streamAnalysis).toHaveBeenCalledTimes(4);
      expect(batchStore.items()[0].status).toBe('done');
      expect(batchStore.items()[3].status).toBe('analyzing');
    });

    it('handles FieldExtracted events by incrementing field count', () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.markItemStatus(0, 'created');

      const subject = new Subject<ExtractionEvent>();
      extractionStreamMock.streamAnalysis.mockReturnValue(subject.asObservable());

      service.startAnalysis();

      subject.next({
        type: 'FieldExtracted',
        field: { fieldName: 'companyName', value: 'Acme Corp', citations: [] },
      });
      subject.next({
        type: 'FieldExtracted',
        field: { fieldName: 'directors', value: 'John Doe', citations: [] },
      });

      expect(batchStore.items()[0].fieldsCount).toBe(2);
      expect(batchStore.items()[0].entityName).toBe('Acme Corp');
    });

    it('marks item as done on AnalysisComplete', () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.markItemStatus(0, 'created');

      extractionStreamMock.streamAnalysis.mockReturnValue(of(
        { type: 'AnalysisComplete', caseId: 'case-1' } as ExtractionEvent,
      ));

      service.startAnalysis();

      expect(batchStore.items()[0].status).toBe('done');
    });

    it('marks item as error on AnalysisError event', () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.markItemStatus(0, 'created');

      extractionStreamMock.streamAnalysis.mockReturnValue(of(
        { type: 'AnalysisError', errorCode: 'LLM_TIMEOUT', message: 'Model timeout' } as ExtractionEvent,
      ));

      service.startAnalysis();

      expect(batchStore.items()[0].status).toBe('error');
      expect(batchStore.items()[0].error).toBe('Model timeout');
    });

    it('marks item as error on stream error', () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.markItemStatus(0, 'created');

      extractionStreamMock.streamAnalysis.mockReturnValue(
        throwError(() => new Error('SSE connection lost'))
      );

      service.startAnalysis();

      expect(batchStore.items()[0].status).toBe('error');
      expect(batchStore.items()[0].error).toBe('SSE connection lost');
    });

    it('sets batchStatus to completed when all items are done', () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.markItemStatus(0, 'created');

      extractionStreamMock.streamAnalysis.mockReturnValue(of(
        { type: 'AnalysisComplete', caseId: 'case-1' } as ExtractionEvent,
      ));

      service.startAnalysis();

      expect(batchStore.batchStatus()).toBe('completed');
    });

    it('sets batchStatus to completed when all items are done or error', () => {
      batchStore.initBatch([createMockFile('a.pdf'), createMockFile('b.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.setCaseId(1, 'case-2');
      batchStore.markItemStatus(0, 'created');
      batchStore.markItemStatus(1, 'created');

      extractionStreamMock.streamAnalysis
        .mockReturnValueOnce(of({ type: 'AnalysisComplete', caseId: 'case-1' } as ExtractionEvent))
        .mockReturnValueOnce(throwError(() => new Error('fail')));

      service.startAnalysis();

      expect(batchStore.batchStatus()).toBe('completed');
      expect(batchStore.items()[0].status).toBe('done');
      expect(batchStore.items()[1].status).toBe('error');
    });
  });

  describe('cancelItem', () => {
    it('marks item as error with cancel message', () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.markItemStatus(0, 'analyzing');

      service.cancelItem(0);

      expect(batchStore.items()[0].status).toBe('error');
      expect(batchStore.items()[0].error).toBe('Anulowano');
    });

    it('unsubscribes the active SSE stream and releases its concurrency slot', () => {
      const files = [
        createMockFile('a.pdf'),
        createMockFile('b.pdf'),
        createMockFile('c.pdf'),
        createMockFile('d.pdf'),
      ];
      batchStore.initBatch(files);
      for (let i = 0; i < files.length; i++) {
        batchStore.setCaseId(i, `case-${i}`);
        batchStore.markItemStatus(i, 'created');
      }

      const teardowns = Array.from({ length: files.length }, () => vi.fn());
      extractionStreamMock.streamAnalysis.mockImplementation((_caseId: string, file: File) => {
        const index = files.indexOf(file);
        return new Observable<ExtractionEvent>(() => teardowns[index]);
      });

      service.startAnalysis();
      expect(extractionStreamMock.streamAnalysis).toHaveBeenCalledTimes(3);

      service.cancelItem(0);

      expect(teardowns[0]).toHaveBeenCalledOnce();
      expect(extractionStreamMock.streamAnalysis).toHaveBeenCalledTimes(4);
      expect(batchStore.items()[3].status).toBe('analyzing');
    });
  });

  describe('cancelAll', () => {
    it('cancels all queued and analyzing items', () => {
      batchStore.initBatch([
        createMockFile('a.pdf'),
        createMockFile('b.pdf'),
        createMockFile('c.pdf'),
      ]);
      for (let i = 0; i < 3; i++) {
        batchStore.setCaseId(i, `case-${i}`);
        batchStore.markItemStatus(i, 'created');
      }

      const subjects: Subject<ExtractionEvent>[] = [];
      extractionStreamMock.streamAnalysis.mockImplementation(() => {
        const s = new Subject<ExtractionEvent>();
        subjects.push(s);
        return s.asObservable();
      });

      service.startAnalysis();
      service.cancelAll();

      const items = batchStore.items();
      for (const item of items) {
        expect(item.status).toBe('error');
        expect(item.error).toBe('Anulowano');
      }
      expect(batchStore.batchStatus()).toBe('completed');
    });
  });

  describe('retryItem', () => {
    it('retries a failed item by starting analysis again', () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.markItemStatus(0, 'error', 'Previous failure');

      extractionStreamMock.streamAnalysis.mockReturnValue(of(
        { type: 'AnalysisComplete', caseId: 'case-1' } as ExtractionEvent,
      ));

      service.retryItem(0);

      expect(batchStore.items()[0].status).toBe('done');
      expect(batchStore.items()[0].error).toBeNull();
    });

    it('does nothing if item is not in error state', () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.markItemStatus(0, 'done');

      service.retryItem(0);

      // Should not have called streamAnalysis
      expect(extractionStreamMock.streamAnalysis).not.toHaveBeenCalled();
    });

    it('does nothing if item has no file', () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.markItemStatus(0, 'error', 'fail');
      // Remove file reference
      batchStore.updateItem(0, { file: null });

      service.retryItem(0);

      expect(extractionStreamMock.streamAnalysis).not.toHaveBeenCalled();
    });
  });

  describe('restoreBatch', () => {
    it('restores batch from localStorage and API', async () => {
      // Setup: create batch, persist manifest
      batchStore.initBatch([createMockFile('a.pdf'), createMockFile('b.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      batchStore.setCaseId(1, 'case-2');
      const batchId = batchStore.batchId()!;

      // Reset in-memory state
      batchStore.batchId.set(null);
      batchStore.items.set([]);

      // Mock API responses
      caseServiceMock.getCase
        .mockReturnValueOnce(of({
          id: 'case-1', status: 'ANALYZED', createdAt: '', updatedAt: '', lockedAt: null, audit: null,
          entityName: 'Acme Corp', fields: [{ fieldName: 'x', value: 'y', citations: [] }], red_flags: null,
        }))
        .mockReturnValueOnce(of({
          id: 'case-2', status: 'CREATED', createdAt: '', updatedAt: '', lockedAt: null, audit: null,
          entityName: null, fields: null, red_flags: null,
        }));

      const result = await service.restoreBatch(batchId);

      expect(result).toBe(true);
      expect(batchStore.batchId()).toBe(batchId);
      expect(batchStore.items()).toHaveLength(2);
      expect(batchStore.items()[0].status).toBe('done');
      expect(batchStore.items()[0].entityName).toBe('Acme Corp');
      expect(batchStore.items()[0].fieldsCount).toBe(1);
      expect(batchStore.items()[1].status).toBe('error');
      expect(batchStore.items()[1].error).toBe('Plik niedostępny — prześlij ponownie');
    });

    it('restores an unfinished case with cached PDF as retryable', async () => {
      const file = createMockFile('a.pdf');
      batchStore.initBatch([file]);
      batchStore.setCaseId(0, 'case-1');
      const batchId = batchStore.batchId()!;
      batchStore.batchId.set(null);
      batchStore.items.set([]);

      caseServiceMock.getCase.mockReturnValue(of({
        id: 'case-1', status: 'ANALYZING', createdAt: '', updatedAt: '', lockedAt: null, audit: null,
        entityName: null, fields: null, red_flags: null,
      }));
      pdfStorageMock.load.mockResolvedValue(file);

      await service.restoreBatch(batchId);

      expect(batchStore.items()[0].status).toBe('error');
      expect(batchStore.items()[0].error).toBe('Analiza przerwana — ponów');
      expect(batchStore.items()[0].file).toBeInstanceOf(File);
    });

    it('returns false for non-existent batch', async () => {
      const result = await service.restoreBatch('non-existent');
      expect(result).toBe(false);
    });

    it('marks case as error if API call fails', async () => {
      batchStore.initBatch([createMockFile('a.pdf')]);
      batchStore.setCaseId(0, 'case-1');
      const batchId = batchStore.batchId()!;
      batchStore.batchId.set(null);
      batchStore.items.set([]);

      caseServiceMock.getCase.mockReturnValue(throwError(() => new Error('404')));

      const result = await service.restoreBatch(batchId);

      expect(result).toBe(true);
      expect(batchStore.items()[0].status).toBe('error');
      expect(batchStore.items()[0].error).toBe('Nie udało się pobrać danych sprawy');
    });
  });
});
