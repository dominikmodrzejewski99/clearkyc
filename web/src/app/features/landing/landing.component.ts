import {
  Component,
  ElementRef,
  AfterViewInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements AfterViewInit {
  private router = inject(Router);
  private el = inject(ElementRef);

  ngAfterViewInit(): void {
    const els = this.el.nativeElement.querySelectorAll('.reveal');
    if (
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      els.forEach((e: Element) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    els.forEach((e: Element) => io.observe(e));
  }

  login(): void {
    this.router.navigate(['cases/new']);
  }
}
