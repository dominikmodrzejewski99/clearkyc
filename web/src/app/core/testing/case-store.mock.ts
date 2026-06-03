import { signal } from '@angular/core';
import { vi } from 'vitest';
import { ActiveCitation, CaseStatus, ExtractionField, FieldOverride, RedFlagItem } from '../models/extraction.models';

// Use real Angular signals — vi.fn() does NOT satisfy Signal<T>.
// The template's @if expressions call each signal as a function and Angular's
// change detection requires a genuine WritableSignal<T> instance.
export function createCaseStoreMock() {
  return {
    caseId:           signal<string | null>(null),
    caseStatus:       signal<CaseStatus>('CREATED'),
    pdfBlob:          signal<Blob | null>(null),
    extractionFields: signal<ExtractionField[]>([]),
    isAnalyzing:      signal<boolean>(false),
    activePage:       signal<number>(1),
    analysisError:    signal<string | null>(null),
    fieldOverrides:   signal<Record<string, FieldOverride>>({}),
    activeQuote:      signal<ActiveCitation | null>(null),
    redFlags:         signal<RedFlagItem[]>([]),

    reset:             vi.fn(),
    appendField:       vi.fn(),
    setOverride:       vi.fn(),
    clearOverride:     vi.fn(),
    setRedFlags:       vi.fn(),
    markAnalysisError: vi.fn(),
    markAnalyzed:      vi.fn(),
    markLocked:        vi.fn(),
  };
}

export type CaseStoreMock = ReturnType<typeof createCaseStoreMock>;
