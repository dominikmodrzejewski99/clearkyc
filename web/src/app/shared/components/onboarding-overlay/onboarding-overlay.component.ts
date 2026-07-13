import { Component, OnInit, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';

@Component({
  selector: 'app-onboarding-overlay',
  standalone: true,
  imports: [A11yModule],
  templateUrl: './onboarding-overlay.component.html',
  styleUrl: './onboarding-overlay.component.scss',
})
export class OnboardingOverlayComponent implements OnInit {
  protected readonly visible = signal(false);
  protected readonly step = signal(1);
  protected readonly TOTAL_STEPS = 3;

  ngOnInit(): void {
    if (!localStorage.getItem('clearkyc_onboarding_v1')) {
      this.visible.set(true);
    }
  }

  protected next(): void {
    if (this.step() < this.TOTAL_STEPS) {
      this.step.update((s) => s + 1);
    } else {
      this.dismiss();
    }
  }

  protected prev(): void {
    if (this.step() > 1) {
      this.step.update((s) => s - 1);
    }
  }

  protected dismiss(): void {
    localStorage.setItem('clearkyc_onboarding_v1', '1');
    this.visible.set(false);
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.dismiss();
    }
  }
}
