import { Component, inject } from '@angular/core';
import { CaseStore } from '../../../../core/store/case.store';
import { CitationBadgeComponent } from '../../../../shared/components/citation-badge/citation-badge.component';

@Component({
  selector: 'app-red-flag-list',
  imports: [CitationBadgeComponent],
  templateUrl: './red-flag-list.component.html',
  styleUrl: './red-flag-list.component.scss',
})
export class RedFlagListComponent {
  protected readonly caseStore = inject(CaseStore);
}
