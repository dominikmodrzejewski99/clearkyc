import { Component, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { CitationBadgeComponent } from '../../../../shared/components/citation-badge/citation-badge.component';
import { CaseStore } from '../../../../core/store/case.store';
import { ExtractionStreamService } from '../../../../core/services/extraction-stream.service';

@Component({
  selector: 'app-extraction-form',
  imports: [CitationBadgeComponent],
  templateUrl: './extraction-form.component.html',
  styleUrl: './extraction-form.component.scss',
})
export class ExtractionFormComponent implements OnDestroy {
  protected readonly caseStore = inject(CaseStore);
  private readonly streamService = inject(ExtractionStreamService);

  private streamSub: Subscription | null = null;

  protected startAnalysis(): void {
    const caseId = this.caseStore.caseId();
    const pdfBlob = this.caseStore.pdfBlob();
    if (!caseId || !pdfBlob) return;

    this.streamSub?.unsubscribe();
    this.caseStore.extractionFields.set([]);
    this.caseStore.analysisError.set(null);
    this.caseStore.isAnalyzing.set(true);

    this.streamSub = this.streamService.streamAnalysis(caseId, pdfBlob as File).subscribe({
      next: event => {
        if (event.type === 'FieldExtracted') this.caseStore.appendField(event.field);
        else if (event.type === 'AnalysisComplete') this.caseStore.markAnalyzed();
        else if (event.type === 'AnalysisError') this.caseStore.markAnalysisError(event.message);
      },
      error: () => this.caseStore.markAnalysisError('Błąd połączenia ze strumieniem analizy.'),
    });
  }

  ngOnDestroy(): void {
    this.streamSub?.unsubscribe();
  }
}
