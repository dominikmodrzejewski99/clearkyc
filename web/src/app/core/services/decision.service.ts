import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FinalizePayload, FinalizeResponse } from '../models/extraction.models';

@Injectable({ providedIn: 'root' })
export class DecisionService {
  private readonly http = inject(HttpClient);

  finalize(caseId: string, payload: FinalizePayload): Observable<FinalizeResponse> {
    return this.http.post<FinalizeResponse>(`/api/cases/${caseId}/finalize`, payload);
  }
}
