import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CitationBadgeComponent } from '../../../../shared/components/citation-badge/citation-badge.component';
import { CaseStore } from '../../../../core/store/case.store';
import { ExtractionStreamService } from '../../../../core/services/extraction-stream.service';
import { Citation, ExtractionField } from '../../../../core/models/extraction.models';

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

  protected isMissing(field: ExtractionField): boolean {
    if (this.caseStore.fieldOverrides()[field.fieldName]) return false;
    return field.value === 'Not Disclosed / Inferred Missing' || (field.citations?.length ?? 0) === 0;
  }

  protected navigateToCitation(citation: Citation): void {
    this.caseStore.activePage.set(citation.page);
    this.caseStore.activeQuote.set({ page: citation.page, quote: citation.quote });
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

    this.streamService.streamAnalysis(caseId, pdfBlob as File)
      .pipe(takeUntil(this.cancelStream$), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: event => {
          if (event.type === 'FieldExtracted') this.caseStore.appendField(event.field);
          else if (event.type === 'RedFlagsFound') this.caseStore.setRedFlags(event.flags);
          else if (event.type === 'AnalysisComplete') this.caseStore.markAnalyzed();
          else if (event.type === 'AnalysisError') this.caseStore.markAnalysisError(event.message);
        },
        error: () => this.caseStore.markAnalysisError('Błąd połączenia ze strumieniem analizy.'),
      });
  }
}
