import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FileDropzoneComponent } from '../../shared/components/file-dropzone/file-dropzone.component';
import { CaseService } from '../../core/services/case.service';
import { CaseStore } from '../../core/store/case.store';
import { CaseSummary } from '../../core/models/extraction.models';

@Component({
  selector: 'app-case-new',
  imports: [FileDropzoneComponent],
  templateUrl: './case-new.component.html',
  styleUrl: './case-new.component.scss',
})
export class CaseNewComponent {
  private readonly caseService = inject(CaseService);
  private readonly caseStore = inject(CaseStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly isUploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);

  protected readonly recentCases = toSignal(
    this.caseService.listCases().pipe(catchError(() => of([] as CaseSummary[]))),
    { initialValue: [] as CaseSummary[] }
  );

  protected onFileSelected(file: File): void {
    this.selectedFile.set(file);
    this.uploadError.set(null);
  }

  protected removeFile(): void {
    this.selectedFile.set(null);
    this.uploadError.set(null);
  }

  protected onSubmit(): void {
    const file = this.selectedFile();
    if (!file) return;

    this.caseStore.reset();
    this.isUploading.set(true);
    this.uploadError.set(null);

    this.caseService.createCase(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.caseStore.caseId.set(response.id);
          this.caseStore.pdfBlob.set(file);
          this.router.navigate(['/cases', response.id]);
        },
        error: () => {
          this.isUploading.set(false);
          this.uploadError.set('Failed to create case. Please try again.');
        },
      });
  }

  protected formatSize(bytes: number): string {
    if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB';
    return Math.round(bytes / 1_000) + ' KB';
  }

  protected formatDate(isoString: string): string {
    const d = new Date(isoString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  protected getCaseBadgeClass(c: CaseSummary): string {
    if (c.status === 'LOCKED' && c.decision) {
      // APPROVE → approved, REJECT → rejected, ESCALATE → escalated
      return c.decision.toLowerCase() + 'd';
    }
    return 'pending';
  }

  protected getCaseBadgeLabel(c: CaseSummary): string {
    const cls = this.getCaseBadgeClass(c);
    return cls.charAt(0).toUpperCase() + cls.slice(1);
  }
}
