import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CaseService } from '../services/case.service';
import { CaseStore } from './case.store';

describe('CaseStore', () => {
  beforeEach(() => {
    // Mirrors the bootstrap-time start mark set by app.config.ts's recentCasesPrefetchInitializer,
    // which performance.measure() requires to already exist.
    performance.mark('clearkyc:recent-cases-prefetch:start');

    TestBed.configureTestingModule({
      providers: [{ provide: CaseService, useValue: { listCases: vi.fn().mockReturnValue(of([])) } }],
    });
  });

  afterEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  it('measures the first successful load exactly once, even across refreshRecentCases cycles', () => {
    const measureSpy = vi.spyOn(performance, 'measure');
    const store = TestBed.inject(CaseStore);

    store.loadRecentCases();
    expect(measureSpy).toHaveBeenCalledTimes(1);
    expect(measureSpy).toHaveBeenCalledWith(
      'clearkyc:recent-cases:first-load',
      'clearkyc:recent-cases-prefetch:start',
      'clearkyc:recent-cases:fetch-end'
    );

    store.refreshRecentCases();
    expect(measureSpy).toHaveBeenCalledTimes(1);
  });
});
