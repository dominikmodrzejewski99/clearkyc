import { Component, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BatchProgressRowComponent } from '../components/batch-progress-row/batch-progress-row.component';
import { BatchStore } from '../../../core/store/batch.store';
import { BatchOrchestrationService } from '../../../core/services/batch-orchestration.service';

@Component({
  selector: 'app-batch-dashboard',
  imports: [BatchProgressRowComponent, RouterLink],
  templateUrl: './batch-dashboard.component.html',
  styleUrl: './batch-dashboard.component.scss',
})
export class BatchDashboardComponent implements OnInit {
  protected readonly batchStore = inject(BatchStore);
  private readonly orchestration = inject(BatchOrchestrationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly isRestoring = computed(() => false); // placeholder for async restore indicator
  protected readonly hasErrors = computed(() => this.batchStore.summary().error > 0);
  protected readonly hasActive = computed(() => {
    const s = this.batchStore.summary();
    return s.queued > 0 || s.analyzing > 0;
  });

  protected readonly progressPercent = computed(() => {
    const s = this.batchStore.summary();
    if (s.total === 0) return 0;
    return Math.round(((s.done + s.error) / s.total) * 100);
  });

  ngOnInit(): void {
    const batchId = this.route.snapshot.paramMap.get('batchId');
    if (!batchId) {
      this.router.navigate(['/batch/new']);
      return;
    }

    // If store already has this batch loaded (navigated from upload), do nothing
    if (this.batchStore.batchId() === batchId) {
      return;
    }

    // Try to restore from localStorage + API
    this.orchestration.restoreBatch(batchId).then(success => {
      if (!success) {
        this.router.navigate(['/batch/new']);
      }
    });
  }

  protected onRetry(index: number): void {
    this.orchestration.retryItem(index);
  }

  protected onCancel(index: number): void {
    this.orchestration.cancelItem(index);
  }

  protected onOpen(caseId: string): void {
    this.router.navigate(['/cases', caseId], {
      queryParams: { batchId: this.batchStore.batchId() },
    });
  }

  protected onRetryAll(): void {
    const items = this.batchStore.items();
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'error' && items[i].file && items[i].caseId) {
        this.orchestration.retryItem(i);
      }
    }
  }

  protected onCancelAll(): void {
    this.orchestration.cancelAll();
  }
}
