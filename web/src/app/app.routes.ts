import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'cases/new',
    loadComponent: () => import('./features/case-new/case-new.component').then(m => m.CaseNewComponent),
    canActivate: [authGuard],
  },
  {
    path: 'cases/:id',
    loadComponent: () => import('./features/case-detail/case-detail.component').then(m => m.CaseDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: '',
    loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent),
  },
  { path: '**', redirectTo: '' },
];
