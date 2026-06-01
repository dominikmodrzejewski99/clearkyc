import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AppLayoutComponent } from '../../layout/app-layout/app-layout.component';
import { PdfViewerComponent } from '../../shared/components/pdf-viewer/pdf-viewer.component';
import { CaseStore } from '../../core/store/case.store';
import { CaseService } from '../../core/services/case.service';

@Component({
  selector: 'app-case-detail',
  imports: [AppLayoutComponent, PdfViewerComponent],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.scss',
})
export class CaseDetailComponent implements OnInit {
  protected readonly caseStore = inject(CaseStore);
  private readonly route = inject(ActivatedRoute);
  private readonly caseService = inject(CaseService);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.caseStore.caseId.set(id);
    this.caseService.getCase(id).subscribe({
      next: response => this.caseStore.caseStatus.set(response.status),
    });
  }

  protected onReUpload(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.caseStore.pdfBlob.set(file);
  }
}
