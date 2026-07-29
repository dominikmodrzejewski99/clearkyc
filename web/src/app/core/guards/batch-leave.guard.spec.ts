import { TestBed } from '@angular/core/testing';
import { BatchStore } from '../store/batch.store';
import { BatchOrchestrationService } from '../services/batch-orchestration.service';
import { batchLeaveGuard } from './batch-leave.guard';

describe('batchLeaveGuard', () => {
  const orchestration = { cancelAll: vi.fn() };
  let store: BatchStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BatchStore,
        { provide: BatchOrchestrationService, useValue: orchestration },
      ],
    });
    store = TestBed.inject(BatchStore);
    orchestration.cancelAll.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cancels active work after navigation confirmation', () => {
    store.batchStatus.set('analyzing');
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() => batchLeaveGuard(null!, null!, null!, null!));

    expect(result).toBe(true);
    expect(orchestration.cancelAll).toHaveBeenCalledOnce();
  });

  it('keeps active work when navigation is rejected', () => {
    store.batchStatus.set('uploading');
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() => batchLeaveGuard(null!, null!, null!, null!));

    expect(result).toBe(false);
    expect(orchestration.cancelAll).not.toHaveBeenCalled();
  });

  it('allows navigation without prompting after completion', () => {
    store.batchStatus.set('completed');
    const confirmSpy = vi.spyOn(globalThis, 'confirm');

    const result = TestBed.runInInjectionContext(() => batchLeaveGuard(null!, null!, null!, null!));

    expect(result).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
