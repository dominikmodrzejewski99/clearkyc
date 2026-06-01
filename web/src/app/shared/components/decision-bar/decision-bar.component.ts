import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CaseStore } from '../../../core/store/case.store';
import { DecisionService } from '../../../core/services/decision.service';

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

  protected isSubmitting = signal(false);
  protected submitError = signal<string | null>(null);
  protected lockedDecision = signal<string | null>(null);

  protected submit(decision: Decision): void {
    const caseId = this.caseStore.caseId();
    if (!caseId) return;

    this.isSubmitting.set(true);
    this.submitError.set(null);

    const extractedData = Object.fromEntries(
      this.caseStore.extractionFields().map(f => [f.fieldName, f.value]),
    );

    this.decisionService.finalize(caseId, {
      decision,
      extractedData,
      overrideJustifications: {},
    }).subscribe({
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
