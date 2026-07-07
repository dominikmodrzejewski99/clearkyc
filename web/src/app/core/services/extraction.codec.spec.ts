import { describe, it, expect } from 'vitest';
import { parseSSEMessage } from './extraction.codec';

describe('parseSSEMessage', () => {
  it('passes through FieldExtracted with non-NDI value and empty citations untouched', () => {
    const raw = [
      'event: FieldExtracted',
      'data: {"fieldName":"Firma","value":"ACME Corp.","citations":[]}',
    ].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('FieldExtracted');
    if (result?.type === 'FieldExtracted') {
      expect(result.field.value).toBe('ACME Corp.');
      expect(result.field.citations).toEqual([]);
    }
  });

  it('passes through FieldExtracted with NDI value and empty citations untouched', () => {
    const raw = [
      'event: FieldExtracted',
      'data: {"fieldName":"Firma","value":"Not Disclosed / Inferred Missing","citations":[]}',
    ].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('FieldExtracted');
    if (result?.type === 'FieldExtracted') {
      expect(result.field.value).toBe('Not Disclosed / Inferred Missing');
      expect(result.field.citations).toEqual([]);
    }
  });

  it('parses AnalysisComplete with caseId present', () => {
    const raw = ['event: AnalysisComplete', 'data: {"caseId":"case-123"}'].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('AnalysisComplete');
    if (result?.type === 'AnalysisComplete') {
      expect(result.caseId).toBe('case-123');
    }
  });

  it('still emits AnalysisComplete when caseId is missing, defaulting to empty string', () => {
    const raw = ['event: AnalysisComplete', 'data: {}'].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('AnalysisComplete');
    if (result?.type === 'AnalysisComplete') {
      expect(result.caseId).toBe('');
    }
  });

  it('parses AnalysisError with errorCode and message present', () => {
    const raw = [
      'event: AnalysisError',
      'data: {"errorCode":"LLM_TIMEOUT","message":"Analiza przekroczyła limit czasu."}',
    ].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('AnalysisError');
    if (result?.type === 'AnalysisError') {
      expect(result.errorCode).toBe('LLM_TIMEOUT');
      expect(result.message).toBe('Analiza przekroczyła limit czasu.');
    }
  });

  it('defaults errorCode to empty string when missing, message still delivered', () => {
    const raw = ['event: AnalysisError', 'data: {"message":"Nieznany błąd."}'].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('AnalysisError');
    if (result?.type === 'AnalysisError') {
      expect(result.errorCode).toBe('');
      expect(result.message).toBe('Nieznany błąd.');
    }
  });

  it('parses RedFlagsFound with flags present', () => {
    const raw = [
      'event: RedFlagsFound',
      'data: {"flags":[{"category":"OWNERSHIP","description":"Brak jawnej struktury UBO","citations":[]}]}',
    ].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('RedFlagsFound');
    if (result?.type === 'RedFlagsFound') {
      expect(result.flags).toHaveLength(1);
      expect(result.flags[0].category).toBe('OWNERSHIP');
    }
  });

  it('defaults RedFlagsFound flags to empty array when missing', () => {
    const raw = ['event: RedFlagsFound', 'data: {}'].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('RedFlagsFound');
    if (result?.type === 'RedFlagsFound') {
      expect(result.flags).toEqual([]);
    }
  });

  it('returns null for an unknown event type', () => {
    const raw = ['event: SomethingUnknown', 'data: {}'].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).toBeNull();
  });

  it('returns null for malformed JSON in the data line', () => {
    const raw = ['event: FieldExtracted', 'data: {not valid json'].join('\n');

    const result = parseSSEMessage(raw);

    expect(result).toBeNull();
  });
});
