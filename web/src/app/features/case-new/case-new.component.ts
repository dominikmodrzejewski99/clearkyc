import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FileDropzoneComponent } from '../../shared/components/file-dropzone/file-dropzone.component';
import { CaseService } from '../../core/services/case.service';
import { CaseStore } from '../../core/store/case.store';

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

  protected isUploading = signal(false);
  protected uploadError = signal<string | null>(null);

  protected onFileSelected(file: File): void {
    this.caseStore.reset();
    this.isUploading.set(true);
    this.uploadError.set(null);

    this.caseService.createCase(file).subscribe({
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
}
