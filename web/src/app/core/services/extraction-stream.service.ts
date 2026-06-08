import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { ExtractionEvent } from '../models/extraction.models';

@Injectable({ providedIn: 'root' })
export class ExtractionStreamService {
  private readonly auth = inject(AuthService);

  streamAnalysis(caseId: string, pdfFile: File): Observable<ExtractionEvent> {
    return new Observable(subscriber => {
      const controller = new AbortController();

      const run = async () => {
        try {
          const token = await firstValueFrom(this.auth.getAccessTokenSilently());
          const form = new FormData();
          form.append('file', pdfFile);

          const response = await fetch(`/api/cases/${caseId}/analysis`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            subscriber.error(new Error(`SSE request failed: ${response.status}`));
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const messages = buffer.split('\n\n');
            buffer = messages.pop() ?? '';

            for (const message of messages) {
              const event = parseSSEMessage(message);
              if (event) subscriber.next(event);
            }
          }

          subscriber.complete();
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') return;
          subscriber.error(err);
        }
      };

      run();
      return () => controller.abort();
    });
  }
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
    if (eventType === 'FieldExtracted') return { type: 'FieldExtracted', field: payload };
    if (eventType === 'AnalysisComplete') return { type: 'AnalysisComplete', caseId: payload.caseId ?? payload };
    if (eventType === 'AnalysisError') return { type: 'AnalysisError', message: payload.message ?? String(payload) };
    if (eventType === 'RedFlagsFound') return { type: 'RedFlagsFound', flags: payload.flags ?? [] };
  } catch {
    // ignore malformed JSON
  }

  return null;
}
