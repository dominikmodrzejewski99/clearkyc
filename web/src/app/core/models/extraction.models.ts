export type CaseStatus = 'CREATED' | 'ANALYZING' | 'ANALYZED' | 'LOCKED';

export interface Citation {
  page: number;
  quote: string;
}

export interface ExtractionField {
  fieldName: string;
  value: string;
  citations: Citation[];
}

export interface FieldOverride {
  originalValue: string;
  newValue: string;
  justification: string;
}

export interface ActiveCitation {
  page: number;
  quote: string;
}

export interface RedFlagItem {
  category: string;
  description: string;
  citations: Citation[];
}

export type ExtractionEvent =
  | { type: 'FieldExtracted'; field: ExtractionField }
  | { type: 'AnalysisComplete'; caseId: string }
  | { type: 'AnalysisError'; message: string }
  | { type: 'RedFlagsFound'; flags: RedFlagItem[] };

export interface CaseDetail {
  id: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  audit: AuditSummary | null;
  entityName?: string | null;
}

export interface AuditSummary {
  auditRecordId: string;
  decision: string;
  finalizedAt: string;
}

export interface CreateCaseResponse {
  id: string;
  status: CaseStatus;
  createdAt: string;
}

export interface CaseSummary {
  id: string;
  status: CaseStatus;
  createdAt: string;
  entityName?: string | null;
  decision?: 'APPROVE' | 'REJECT' | 'ESCALATE' | null;
}

export interface FieldRecord {
  fieldName: string;
  value: string;
  citations: Citation[];
  override?: FieldOverride | null;
}

export interface FinalizePayload {
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE';
  fields: FieldRecord[];
  red_flags?: RedFlagItem[];
}

export interface FinalizeResponse {
  auditRecordId: string;
  decision: string;
  finalizedAt: string;
}
