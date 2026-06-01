export type CaseStatus = 'CREATED' | 'ANALYZING' | 'ANALYZED' | 'LOCKED';

export type Citation = {
  page: number;
  quote: string;
};

export type ExtractionField = {
  fieldName: string;
  value: string;
  citations: Citation[];
};

export type Override = {
  fieldName: string;
  originalValue: string;
  overriddenValue: string;
  justification: string;
};

export type ExtractionEvent =
  | { type: 'FieldExtracted'; field: ExtractionField }
  | { type: 'AnalysisComplete'; caseId: string }
  | { type: 'AnalysisError'; message: string };

export type CaseDetail = {
  id: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  audit: AuditSummary | null;
};

export type AuditSummary = {
  auditRecordId: string;
  decision: string;
  finalizedAt: string;
};

export type CreateCaseResponse = {
  id: string;
  status: CaseStatus;
  createdAt: string;
};

export type FinalizePayload = {
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE';
  extractedData: Record<string, unknown>;
  overrideJustifications: Record<string, string>;
};

export type FinalizeResponse = {
  auditRecordId: string;
  decision: string;
  finalizedAt: string;
};
