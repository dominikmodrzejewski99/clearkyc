export type BatchItemStatus = 'pending' | 'uploading' | 'created' | 'queued' | 'analyzing' | 'done' | 'error';
export type BatchStatus = 'selecting' | 'uploading' | 'analyzing' | 'completed';

export interface BatchItem {
  file: File | null;
  fileName: string;
  fileSize: number;
  caseId: string | null;
  status: BatchItemStatus;
  entityName: string | null;
  error: string | null;
  fieldsCount: number;
}

export interface BatchManifest {
  batchId: string;
  caseIds: string[];
  createdAt: string;
}

export interface BatchSummary {
  total: number;
  done: number;
  error: number;
  analyzing: number;
  queued: number;
}
