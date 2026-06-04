import { Injectable, signal } from '@angular/core';
import { ActiveCitation, CaseStatus, ExtractionField, FieldOverride, RedFlagItem } from '../models/extraction.models';

@Injectable({ providedIn: 'root' })
export class CaseStore {
  readonly caseId = signal<string | null>(null);
  readonly caseStatus = signal<CaseStatus>('CREATED');
  readonly entityName = signal<string | null>(null);
  readonly pdfBlob = signal<Blob | null>(null);
  readonly extractionFields = signal<ExtractionField[]>([]);
  readonly isAnalyzing = signal<boolean>(false);
  readonly activePage = signal<number>(1);
  readonly analysisError = signal<string | null>(null);
  readonly fieldOverrides = signal<Record<string, FieldOverride>>({});
  readonly activeQuote = signal<ActiveCitation | null>(null);
  readonly redFlags = signal<RedFlagItem[]>([]);

  reset(): void {
    this.caseId.set(null);
    this.caseStatus.set('CREATED');
    this.entityName.set(null);
    this.pdfBlob.set(null);
    this.extractionFields.set([]);
    this.isAnalyzing.set(false);
    this.activePage.set(1);
    this.analysisError.set(null);
    this.fieldOverrides.set({});
    this.activeQuote.set(null);
    this.redFlags.set([]);
  }

  appendField(field: ExtractionField): void {
    this.extractionFields.update(fields => [...fields, field]);
  }

  setOverride(fieldName: string, override: FieldOverride): void {
    this.fieldOverrides.update(m => ({ ...m, [fieldName]: override }));
  }

  clearOverride(fieldName: string): void {
    this.fieldOverrides.update(m => {
      const next = { ...m };
      delete next[fieldName];
      return next;
    });
  }

  setRedFlags(flags: RedFlagItem[]): void {
    this.redFlags.set(flags);
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
