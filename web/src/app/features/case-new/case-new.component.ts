import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FileDropzoneComponent } from '../../shared/components/file-dropzone/file-dropzone.component';
import { CaseService } from '../../core/services/case.service';
import { CaseStore } from '../../core/store/case.store';
import { CaseSummary } from '../../core/models/extraction.models';
import { getCaseBadgeLabel as resolveCaseBadgeLabel } from '../../core/models/ui-labels';

interface SampleDocument {
  id: string;
  path: string;
  entityName: string;
  tag: string;
}

@Component({
  selector: 'app-case-new',
  imports: [FileDropzoneComponent, RouterLink],
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

  protected readonly loadingSampleId = signal<string | null>(null);
  protected readonly sampleErrorId = signal<string | null>(null);

  protected readonly sampleDocuments: SampleDocument[] = [
    {
      id: 'northgate',
      path: '/demo/northgate-holdings-articles.pdf',
      entityName: 'Northgate Holdings Limited',
      tag: 'Ukryty UBO, nominee director',
    },
    {
      id: 'meridian',
      path: '/demo/meridian-retail-group.pdf',
      entityName: 'Meridian Retail Group Ltd',
      tag: 'Czysta sprawa, brak red flag',
    },
    {
      id: 'bosphorus',
      path: '/demo/bosphorus-trading-fze.pdf',
      entityName: 'Bosphorus Trading FZE',
      tag: 'Sankcje / PEP linkage',
    },
  ];

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

  protected loadSampleDocument(doc: SampleDocument): void {
    this.loadingSampleId.set(doc.id);
    this.sampleErrorId.set(null);

    fetch(doc.path)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        const filename = doc.path.split('/').pop()!;
        const file = new File([blob], filename, { type: 'application/pdf' });
        this.onFileSelected(file);
      })
      .catch(() => {
        this.sampleErrorId.set(doc.id);
      })
      .finally(() => {
        this.loadingSampleId.set(null);
      });
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
          this.uploadError.set('Nie udało się utworzyć sprawy. Spróbuj ponownie.');
        },
      });
  }

  protected formatSize(bytes: number): string {
    if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB';
    return Math.round(bytes / 1_000) + ' KB';
  }

  protected formatDate(isoString: string): string {
    const d = new Date(isoString);
    const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  protected getCaseBadgeClass(c: CaseSummary): string {
    if (c.status === 'LOCKED' && c.decision) {
      const classes: Record<string, string> = {
        APPROVE: 'approved',
        REJECT: 'rejected',
        ESCALATE: 'escalated',
      };
      return classes[c.decision] ?? 'pending';
    }
    return 'pending';
  }

  protected getCaseBadgeLabel(c: CaseSummary): string {
    return resolveCaseBadgeLabel(this.getCaseBadgeClass(c));
  }
}
