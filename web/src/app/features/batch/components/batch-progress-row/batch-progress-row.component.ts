import { Component, EventEmitter, Output, computed, input } from '@angular/core';
import { BatchItem } from '../../../../core/models/batch.models';

@Component({
  selector: 'app-batch-progress-row',
  templateUrl: './batch-progress-row.component.html',
  styleUrl: './batch-progress-row.component.scss',
})
export class BatchProgressRowComponent {
  readonly item = input.required<BatchItem>();
  readonly index = input.required<number>();

  @Output() retry = new EventEmitter<number>();
  @Output() cancelItem = new EventEmitter<number>();
  @Output() openCase = new EventEmitter<string>();

  protected readonly statusLabel = computed(() => {
    switch (this.item().status) {
      case 'pending': return 'Oczekuje';
      case 'uploading': return 'Przesyłanie';
      case 'created': return 'Utworzono';
      case 'queued': return 'W kolejce';
      case 'analyzing': return 'Analiza...';
      case 'done': return 'Gotowe';
      case 'error': return 'Błąd';
      default: return '';
    }
  });

  protected readonly badgeClass = computed(() => {
    switch (this.item().status) {
      case 'pending':
      case 'created': return 'badge--neutral';
      case 'uploading':
      case 'queued': return 'badge--waiting';
      case 'analyzing': return 'badge--active';
      case 'done': return 'badge--success';
      case 'error': return 'badge--error';
      default: return '';
    }
  });

  protected onRetry(): void {
    this.retry.emit(this.index());
  }

  protected onCancel(): void {
    this.cancelItem.emit(this.index());
  }

  protected onOpen(): void {
    const caseId = this.item().caseId;
    if (caseId) this.openCase.emit(caseId);
  }
}
