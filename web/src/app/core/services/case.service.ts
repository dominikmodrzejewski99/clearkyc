import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CaseDetail, CaseSummary, CreateCaseResponse } from '../models/extraction.models';

@Injectable({ providedIn: 'root' })
export class CaseService {
  private readonly http = inject(HttpClient);

  createCase(file: File): Observable<CreateCaseResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<CreateCaseResponse>('/api/cases', form);
  }

  getCase(caseId: string): Observable<CaseDetail> {
    return this.http.get<CaseDetail>(`/api/cases/${caseId}`);
  }

  listCases(): Observable<CaseSummary[]> {
    return this.http.get<CaseSummary[]>('/api/cases');
  }
}
