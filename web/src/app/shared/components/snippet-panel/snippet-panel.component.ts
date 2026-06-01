import { Component, inject } from '@angular/core';
import { CaseStore } from '../../../core/store/case.store';

@Component({
  selector: 'app-snippet-panel',
  templateUrl: './snippet-panel.component.html',
  styleUrl: './snippet-panel.component.scss',
})
export class SnippetPanelComponent {
  protected readonly caseStore = inject(CaseStore);

  protected close(): void {
    this.caseStore.activeQuote.set(null);
  }
}
