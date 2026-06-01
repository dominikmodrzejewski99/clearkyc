import { Injectable, signal } from '@angular/core';
import { CaseStatus, ExtractionField } from '../models/extraction.models';

@Injectable({ providedIn: 'root' })
export class CaseStore {
  readonly caseId = signal<string | null>(null);
  readonly caseStatus = signal<CaseStatus>('CREATED');
  readonly pdfBlob = signal<Blob | null>(null);
  readonly extractionFields = signal<ExtractionField[]>([]);
  readonly isAnalyzing = signal<boolean>(false);
  readonly activePage = signal<number>(1);
  readonly analysisError = signal<string | null>(null);

  reset(): void {
    this.caseId.set(null);
    this.caseStatus.set('CREATED');
    this.pdfBlob.set(null);
    this.extractionFields.set([]);
    this.isAnalyzing.set(false);
    this.activePage.set(1);
    this.analysisError.set(null);
  }

  appendField(field: ExtractionField): void {
    this.extractionFields.update(fields => [...fields, field]);
  }

  markAnalysisError(message: string): void {
    this.analysisError.set(message);
    this.isAnalyzing.set(false);
  }

  markAnalyzed(): void {
    this.caseStatus.set('ANALYZED');
    this.isAnalyzing.set(false);
  }

  markLocked(): void {
    this.caseStatus.set('LOCKED');
  }
}
