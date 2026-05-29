import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { CaseNewComponent } from './features/case-new/case-new.component';
import { CaseDetailComponent } from './features/case-detail/case-detail.component';

export const routes: Routes = [
  { path: 'cases/new', component: CaseNewComponent, canActivate: [authGuard] },
  { path: 'cases/:id', component: CaseDetailComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'cases/new', pathMatch: 'full' },
  { path: '**', redirectTo: 'cases/new' }
];
