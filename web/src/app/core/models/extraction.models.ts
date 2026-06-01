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

export type FieldOverride = {
  originalValue: string;
  newValue: string;
  justification: string;
};

export type ActiveCitation = {
  page: number;
  quote: string;
};

export type RedFlagItem = {
  category: string;
  description: string;
  citations: Citation[];
};

export type ExtractionEvent =
  | { type: 'FieldExtracted'; field: ExtractionField }
  | { type: 'AnalysisComplete'; caseId: string }
  | { type: 'AnalysisError'; message: string }
  | { type: 'RedFlagsFound'; flags: RedFlagItem[] };

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

export type FieldRecord = {
  fieldName: string;
  value: string;
  citations: Citation[];
  override?: FieldOverride | null;
};

export type FinalizePayload = {
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE';
  fields: FieldRecord[];
  red_flags?: RedFlagItem[];
};

export type FinalizeResponse = {
  auditRecordId: string;
  decision: string;
  finalizedAt: string;
};
