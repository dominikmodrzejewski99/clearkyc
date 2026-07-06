import { Component, DestroyRef, OnInit, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AppLayoutComponent } from '../../layout/app-layout/app-layout.component';
import { PdfViewerComponent } from '../../shared/components/pdf-viewer/pdf-viewer.component';
import { ExtractionFormComponent } from './components/extraction-form/extraction-form.component';
import { DecisionBarComponent } from '../../shared/components/decision-bar/decision-bar.component';
import { RedFlagListComponent } from './components/red-flag-list/red-flag-list.component';
import { WorkstationTopbarComponent } from '../../shared/components/workstation-topbar/workstation-topbar.component';
import { OnboardingOverlayComponent } from '../../shared/components/onboarding-overlay/onboarding-overlay.component';
import { CaseStore } from '../../core/store/case.store';
import { CaseService } from '../../core/services/case.service';

@Component({
  selector: 'app-case-detail',
  imports: [AppLayoutComponent, PdfViewerComponent, ExtractionFormComponent, DecisionBarComponent, RedFlagListComponent, WorkstationTopbarComponent, OnboardingOverlayComponent],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.scss',
})
export class CaseDetailComponent implements OnInit {
  protected readonly caseStore = inject(CaseStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly caseService = inject(CaseService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly runState = computed(() => {
    if (this.caseStore.isAnalyzing()) return 'running' as const;
    const s = this.caseStore.caseStatus();
    return (s === 'ANALYZED' || s === 'LOCKED') ? 'complete' as const : 'idle' as const;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    if (this.caseStore.caseId() !== id) {
      this.caseStore.reset();
      this.caseStore.caseId.set(id);
    } else {
      this.caseStore.isAnalyzing.set(false);
    }
    this.caseService.getCase(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.caseStore.caseStatus.set(response.status);
          this.caseStore.entityName.set(response.entityName ?? null);
          // Wczytaj dane ekstrakcji jeśli są dostępne (dla LOCKED cases)
          if (response.fields) {
            this.caseStore.extractionFields.set(response.fields);
          }
          if (response.red_flags) {
            this.caseStore.setRedFlags(response.red_flags);
          }
        },
      });

    if (!this.caseStore.pdfBlob()) {
      this.caseService.getPdfDocument(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: blob => this.caseStore.pdfBlob.set(blob),
          error: () => { /* 404 for cases created before PDF storage — re-upload banner shown */ },
        });
    }
  }

  protected onDecided(): void {
    setTimeout(() => this.router.navigate(['/cases/new']), 1500);
  }

  protected onReUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.caseStore.pdfBlob.set(file);
  }
}
