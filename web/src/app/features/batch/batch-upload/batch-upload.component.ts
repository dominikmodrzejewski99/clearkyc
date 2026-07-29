import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BatchDropzoneComponent } from '../components/batch-dropzone/batch-dropzone.component';
import { BatchStore } from '../../../core/store/batch.store';
import { BatchOrchestrationService } from '../../../core/services/batch-orchestration.service';

@Component({
  selector: 'app-batch-upload',
  imports: [BatchDropzoneComponent, RouterLink],
  templateUrl: './batch-upload.component.html',
  styleUrl: './batch-upload.component.scss',
})
export class BatchUploadComponent {
  private readonly batchStore = inject(BatchStore);
  private readonly orchestration = inject(BatchOrchestrationService);
  private readonly router = inject(Router);

  protected readonly selectedFiles = signal<File[]>([]);
  protected readonly isStarting = signal(false);

  protected onFilesSelected(files: File[]): void {
    this.selectedFiles.update(current => {
      const combined = [...current, ...files];
      // Deduplicate by name+size
      const seen = new Set<string>();
      return combined.filter(f => {
        const key = `${f.name}:${f.size}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }

  protected removeFile(index: number): void {
    this.selectedFiles.update(files => files.filter((_, i) => i !== index));
  }

  protected clearAll(): void {
    this.selectedFiles.set([]);
  }

  protected formatSize(bytes: number): string {
    if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB';
    return Math.round(bytes / 1_000) + ' KB';
  }

  protected async onStart(): Promise<void> {
    const files = this.selectedFiles();
    if (files.length === 0) return;

    this.isStarting.set(true);
    this.batchStore.initBatch(files);
    const batchId = this.batchStore.batchId()!;

    // Navigate to dashboard immediately, upload starts in background
    await this.router.navigate(['/batch', batchId]);
    this.orchestration.startUpload();
  }
}
