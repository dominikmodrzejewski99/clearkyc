import { describe, it, expect } from 'vitest';
import { parseSSEMessage } from './extraction-stream.service';

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
});
