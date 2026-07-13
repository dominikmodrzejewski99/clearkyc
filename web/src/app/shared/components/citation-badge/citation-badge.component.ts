import { Component, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { Citation } from '../../../core/models/extraction.models';
import { CaseStore } from '../../../core/store/case.store';

@Component({
  selector: 'app-citation-badge',
  templateUrl: './citation-badge.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './citation-badge.component.scss',
})
export class CitationBadgeComponent {
  readonly citation = input.required<Citation>();
  readonly index = input.required<number>();

  private readonly caseStore = inject(CaseStore);

  protected navigate(): void {
    this.caseStore.activePage.set(this.citation().page);
    this.caseStore.activeQuote.set({ page: this.citation().page, quote: this.citation().quote });
  }
}
