import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BatchOrchestrationService } from '../../../core/services/batch-orchestration.service';
import { BatchStore } from '../../../core/store/batch.store';
import { BatchDashboardComponent } from './batch-dashboard.component';

@Component({ template: '' })
class EmptyComponent {}

describe('BatchDashboardComponent navigation', () => {
  it('passes source batchId when opening a case', async () => {
    await TestBed.configureTestingModule({
      imports: [BatchDashboardComponent],
      providers: [
        BatchStore,
        {
          provide: BatchOrchestrationService,
          useValue: {
            restoreBatch: vi.fn().mockResolvedValue(true),
            retryItem: vi.fn(),
            cancelItem: vi.fn(),
            cancelAll: vi.fn(),
          },
        },
        provideRouter([
          { path: 'batch/:batchId', component: BatchDashboardComponent },
          { path: 'cases/:id', component: EmptyComponent },
        ]),
      ],
    })
      .overrideComponent(BatchDashboardComponent, { set: { template: '' } })
      .compileComponents();

    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      '/batch/batch-123',
      BatchDashboardComponent,
    );
    TestBed.inject(BatchStore).batchId.set('batch-123');

    component['onOpen']('case-456');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/cases/case-456?batchId=batch-123');
  });
});
