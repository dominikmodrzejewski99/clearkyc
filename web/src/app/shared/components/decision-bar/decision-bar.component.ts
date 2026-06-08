import { Component, DestroyRef, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CaseStore } from '../../../core/store/case.store';
import { DecisionService } from '../../../core/services/decision.service';
import { FieldRecord } from '../../../core/models/extraction.models';

type Decision = 'APPROVE' | 'REJECT' | 'ESCALATE';

@Component({
  selector: 'app-decision-bar',
  templateUrl: './decision-bar.component.html',
  styleUrl: './decision-bar.component.scss',
})
export class DecisionBarComponent {
  @Output() decided = new EventEmitter<Decision>();

  protected readonly caseStore = inject(CaseStore);
  private readonly decisionService = inject(DecisionService);
  private readonly destroyRef = inject(DestroyRef);

  protected isSubmitting = signal(false);
  protected submitError = signal<string | null>(null);
  protected lockedDecision = signal<string | null>(null);
  protected pendingDecision = signal<Decision | null>(null);

  protected readonly missingFieldsCount = computed(() =>
    this.caseStore.extractionFields().filter(f =>
      (f.value === 'Not Disclosed / Inferred Missing' || !f.value) &&
      !this.caseStore.fieldOverrides()[f.fieldName]
    ).length
  );

  protected pickDecision(d: Decision): void {
    this.pendingDecision.set(d);
  }

  protected commit(): void {
    const d = this.pendingDecision();
    if (!d) return;
    this.submit(d);
  }

  protected submit(decision: Decision): void {
    const caseId = this.caseStore.caseId();
    if (!caseId) return;

    this.isSubmitting.set(true);
    this.submitError.set(null);

    const overrides = this.caseStore.fieldOverrides();
    const fields: FieldRecord[] = this.caseStore.extractionFields().map(f => ({
      fieldName: f.fieldName,
      value: overrides[f.fieldName]?.newValue ?? f.value,
      citations: f.citations,
      override: overrides[f.fieldName] ?? null,
    }));

    this.decisionService.finalize(caseId, { decision, fields, red_flags: this.caseStore.redFlags() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.lockedDecision.set(response.decision);
          this.caseStore.markLocked();
          this.decided.emit(decision);
          this.isSubmitting.set(false);
        },
        error: () => {
          this.submitError.set('Nie udało się zapisać decyzji. Spróbuj ponownie.');
          this.isSubmitting.set(false);
        },
      });
  }
}
