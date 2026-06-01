import { Component, inject, input } from '@angular/core';
import { Citation } from '../../../core/models/extraction.models';
import { CaseStore } from '../../../core/store/case.store';

@Component({
  selector: 'app-citation-badge',
  templateUrl: './citation-badge.component.html',
  styleUrl: './citation-badge.component.scss',
})
export class CitationBadgeComponent {
  readonly citation = input.required<Citation>();
  readonly index = input.required<number>();

  private readonly caseStore = inject(CaseStore);

  protected navigate(): void {
    this.caseStore.activePage.set(this.citation().page);
  }
}
