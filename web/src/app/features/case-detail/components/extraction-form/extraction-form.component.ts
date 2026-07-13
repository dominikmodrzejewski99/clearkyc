import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CitationBadgeComponent } from '../../../../shared/components/citation-badge/citation-badge.component';
import { CaseStore } from '../../../../core/store/case.store';
import { ExtractionStreamService } from '../../../../core/services/extraction-stream.service';
import { Citation, ExtractionField } from '../../../../core/models/extraction.models';
import { getFieldLabel } from '../../../../core/models/ui-labels';

@Component({
  selector: 'app-extraction-form',
  imports: [CitationBadgeComponent],
  templateUrl: './extraction-form.component.html',
  styleUrl: './extraction-form.component.scss',
})
export class ExtractionFormComponent {
  protected readonly caseStore = inject(CaseStore);
  private readonly streamService = inject(ExtractionStreamService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cancelStream$ = new Subject<void>();

  protected readonly editingField = signal<string | null>(null);
  protected readonly editDraft = signal<string>('');
  protected readonly editJustification = signal<string>('');
  protected readonly showReanalyzeWarning = signal<boolean>(false);
  protected readonly expandedOverrideField = signal<string | null>(null);
  protected readonly calloutDismissed = signal<boolean>(false);

  private static readonly CHARS_PER_SECOND = 25;
  private static readonly MIN_DURATION_MS = 350;
  private static readonly MAX_DURATION_MS = 1200;
  private static readonly TICK_MS = 16;

  protected readonly displayedValues = signal<Record<string, string>>({});
  protected readonly typingFieldNames = signal<ReadonlySet<string>>(new Set());
  private readonly revealQueue: { fieldName: string; fullValue: string }[] = [];
  private activeReveal: { fieldName: string; fullValue: string; startedAt: number; durationMs: number } | null = null;
  private revealIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopRevealInterval());
  }

  protected dismissCallout(): void {
    this.calloutDismissed.set(true);
  }

  protected readonly totalFieldsCount = computed(() => this.caseStore.extractionFields().length);
  protected readonly citedFieldsCount = computed(() =>
    this.caseStore.extractionFields().filter(f => f.citations && f.citations.length > 0).length
  );

  protected tryStartAnalysis(): void {
    if (Object.keys(this.caseStore.fieldOverrides()).length > 0) {
      this.showReanalyzeWarning.set(true);
    } else {
      this.startAnalysis();
    }
  }

  protected confirmReanalyze(): void {
    this.caseStore.fieldOverrides.set({});
    this.caseStore.activeQuote.set(null);
    this.showReanalyzeWarning.set(false);
    this.startAnalysis();
  }

  protected startEdit(field: ExtractionField): void {
    const override = this.caseStore.fieldOverrides()[field.fieldName];
    this.editDraft.set(override?.newValue ?? field.value);
    this.editJustification.set('');
    this.editingField.set(field.fieldName);
  }

  protected saveEdit(field: ExtractionField): void {
    if (!this.editJustification().trim()) return;
    this.caseStore.setOverride(field.fieldName, {
      originalValue: field.value,
      newValue: this.editDraft(),
      justification: this.editJustification(),
    });
    this.editingField.set(null);
    this.editDraft.set('');
    this.editJustification.set('');
  }

  protected cancelEdit(): void {
    this.editingField.set(null);
    this.editDraft.set('');
    this.editJustification.set('');
  }

  protected toggleOverrideDetail(fieldName: string): void {
    this.expandedOverrideField.update(f => f === fieldName ? null : fieldName);
  }

  protected updateEditDraft(event: Event): void {
    this.editDraft.set((event.target as HTMLInputElement).value);
  }

  protected updateEditJustification(event: Event): void {
    this.editJustification.set((event.target as HTMLTextAreaElement).value);
  }

  protected fieldLabel(fieldName: string): string {
    return getFieldLabel(fieldName);
  }

  protected isMissing(field: ExtractionField): boolean {
    if (this.caseStore.fieldOverrides()[field.fieldName]) return false;
    return field.value === 'Not Disclosed / Inferred Missing' || (field.citations?.length ?? 0) === 0;
  }

  protected navigateToCitation(citation: Citation): void {
    this.caseStore.activePage.set(citation.page);
    this.caseStore.activeQuote.set({ page: citation.page, quote: citation.quote });
  }

  private registerFieldForReveal(field: ExtractionField): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    this.revealQueue.push({ fieldName: field.fieldName, fullValue: field.value });
    this.startNextReveal();
  }

  private startNextReveal(): void {
    if (this.activeReveal !== null) return;
    const next = this.revealQueue.shift();
    if (!next) return;

    const durationMs = Math.min(
      ExtractionFormComponent.MAX_DURATION_MS,
      Math.max(ExtractionFormComponent.MIN_DURATION_MS, (next.fullValue.length / ExtractionFormComponent.CHARS_PER_SECOND) * 1000)
    );
    this.activeReveal = { fieldName: next.fieldName, fullValue: next.fullValue, startedAt: Date.now(), durationMs };
    this.typingFieldNames.set(new Set([next.fieldName]));
    this.displayedValues.update(values => ({ ...values, [next.fieldName]: '' }));

    if (this.revealIntervalId === null) {
      this.revealIntervalId = setInterval(() => this.tickReveal(), ExtractionFormComponent.TICK_MS);
    }
  }

  private tickReveal(): void {
    const state = this.activeReveal;
    if (!state) {
      this.stopRevealInterval();
      return;
    }

    const progress = Math.min(1, (Date.now() - state.startedAt) / state.durationMs);
    const revealedLength = Math.floor(state.fullValue.length * progress);
    this.displayedValues.update(values => ({ ...values, [state.fieldName]: state.fullValue.slice(0, revealedLength) }));

    if (progress >= 1) {
      this.activeReveal = null;
      this.typingFieldNames.set(new Set());
      this.startNextReveal();
      if (this.activeReveal === null) this.stopRevealInterval();
    }
  }

  private stopRevealInterval(): void {
    if (this.revealIntervalId !== null) {
      clearInterval(this.revealIntervalId);
      this.revealIntervalId = null;
    }
  }

  private startAnalysis(): void {
    const caseId = this.caseStore.caseId();
    const pdfBlob = this.caseStore.pdfBlob();
    if (!caseId || !pdfBlob) return;

    this.cancelStream$.next(); // cancel any in-flight stream
    this.caseStore.extractionFields.set([]);
    this.caseStore.setRedFlags([]);
    this.caseStore.analysisError.set(null);
    this.caseStore.isAnalyzing.set(true);
    this.stopRevealInterval();
    this.revealQueue.length = 0;
    this.activeReveal = null;
    this.typingFieldNames.set(new Set());
    this.displayedValues.set({});

    this.streamService.streamAnalysis(caseId, pdfBlob as File)
      .pipe(takeUntil(this.cancelStream$), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: event => {
          switch (event.type) {
            case 'FieldExtracted':
              this.caseStore.appendField(event.field);
              this.registerFieldForReveal(event.field);
              break;
            case 'RedFlagsFound': this.caseStore.setRedFlags(event.flags); break;
            case 'AnalysisComplete': this.caseStore.markAnalyzed(); break;
            case 'AnalysisError':
              console.error('[extraction]', event.errorCode, event.message);
              this.caseStore.markAnalysisError(event.message);
              break;
            default: {
              event satisfies never;
            }
          }
        },
        error: () => this.caseStore.markAnalysisError('Błąd połączenia ze strumieniem analizy.'),
      });
  }
}
