import { Component, input } from '@angular/core';

@Component({
  selector: 'app-workstation-topbar',
  templateUrl: './workstation-topbar.component.html',
  styleUrl: './workstation-topbar.component.scss',
})
export class WorkstationTopbarComponent {
  readonly entityName = input<string | null>(null);
  readonly caseId = input<string | null>(null);
  readonly runState = input<'idle' | 'running' | 'complete'>('idle');
}
