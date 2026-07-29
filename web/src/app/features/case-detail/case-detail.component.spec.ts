import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { CaseService } from '../../core/services/case.service';
import { CaseStore } from '../../core/store/case.store';
import { CaseDetailComponent } from './case-detail.component';

@Component({ template: '' })
class EmptyComponent {}

describe('CaseDetailComponent return navigation', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CaseDetailComponent],
      providers: [
        CaseStore,
        {
          provide: CaseService,
          useValue: {
            getCase: vi.fn().mockReturnValue(of({
              id: 'case-1',
              status: 'LOCKED',
              entityName: 'ACME',
              fields: [],
              red_flags: [],
            })),
            getPdfDocument: vi.fn().mockReturnValue(of(new Blob())),
            listCases: vi.fn().mockReturnValue(of([])),
          },
        },
        provideRouter([
          { path: 'cases/:id', component: CaseDetailComponent },
          { path: 'cases/new', component: EmptyComponent },
          { path: 'batch/:batchId', component: EmptyComponent },
        ]),
      ],
    })
      .overrideComponent(CaseDetailComponent, { set: { template: '' } })
      .compileComponents();
  });

  it('returns a batch case to its source dashboard after decision', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      '/cases/case-1?batchId=batch-123',
      CaseDetailComponent,
    );
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === 'function') handler();
        return 0;
      }) as typeof setTimeout,
    );

    expect(component['returnRoute']()).toEqual(['/batch', 'batch-123']);
    component['onDecided']();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/batch/batch-123');
    timeoutSpy.mockRestore();
  });

  it('keeps list fallback for a regular case', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/cases/case-1', CaseDetailComponent);

    expect(component['returnRoute']()).toEqual(['/cases/new']);
  });
});
