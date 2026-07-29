import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { BatchStore } from '../store/batch.store';
import { BatchOrchestrationService } from '../services/batch-orchestration.service';
import { BatchDashboardComponent } from '../../features/batch/batch-dashboard/batch-dashboard.component';

export const batchLeaveGuard: CanDeactivateFn<BatchDashboardComponent> = () => {
  const batchStore = inject(BatchStore);
  const orchestration = inject(BatchOrchestrationService);
  const status = batchStore.batchStatus();

  if (status === 'uploading' || status === 'analyzing') {
    const shouldLeave = confirm('Analiza w toku. Czy na pewno chcesz opuścić stronę? Aktywne przetwarzanie zostanie przerwane.');
    if (shouldLeave) {
      orchestration.cancelAll();
    }
    return shouldLeave;
  }

  return true;
};
