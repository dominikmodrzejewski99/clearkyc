import { ExtractionEvent, ExtractionField, RedFlagItem } from '../models/extraction.models';

function toFieldExtracted(payload: unknown): ExtractionField {
  return payload as ExtractionField;
}

function toAnalysisComplete(payload: unknown): { caseId: string } {
  const raw = payload as { caseId?: unknown };
  if (typeof raw.caseId !== 'string') {
    console.warn('[extraction.codec] AnalysisComplete missing caseId, defaulting to empty string', payload);
    return { caseId: '' };
  }
  return { caseId: raw.caseId };
}

function toAnalysisError(payload: unknown): { errorCode: string; message: string } {
  const raw = payload as { errorCode?: unknown; message?: unknown };
  if (typeof raw.errorCode !== 'string') {
    console.warn('[extraction.codec] AnalysisError missing errorCode, defaulting to empty string', payload);
  }
  return {
    errorCode: typeof raw.errorCode === 'string' ? raw.errorCode : '',
    message: typeof raw.message === 'string' ? raw.message : String(payload),
  };
}

function toRedFlagsFound(payload: unknown): RedFlagItem[] {
  const raw = payload as { flags?: RedFlagItem[] };
  return raw.flags ?? [];
}

export function parseSSEMessage(raw: string): ExtractionEvent | null {
  let eventType = '';
  let dataLine = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) eventType = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLine = line.slice(5).trim();
  }

  if (!eventType || !dataLine) return null;

  try {
    const payload = JSON.parse(dataLine);
    const typedEventType = eventType as ExtractionEvent['type'];
    switch (typedEventType) {
      case 'FieldExtracted': return { type: 'FieldExtracted', field: toFieldExtracted(payload) };
      case 'AnalysisComplete': return { type: 'AnalysisComplete', ...toAnalysisComplete(payload) };
      case 'AnalysisError': return { type: 'AnalysisError', ...toAnalysisError(payload) };
      case 'RedFlagsFound': return { type: 'RedFlagsFound', flags: toRedFlagsFound(payload) };
      default: {
        typedEventType satisfies never;
        return null;
      }
    }
  } catch {
    // ignore malformed JSON
  }

  return null;
}
