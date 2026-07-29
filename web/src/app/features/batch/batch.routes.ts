import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { batchLeaveGuard } from '../../core/guards/batch-leave.guard';

export const batchRoutes: Routes = [
  {
    path: 'new',
    loadComponent: () => import('./batch-upload/batch-upload.component').then(m => m.BatchUploadComponent),
    canActivate: [authGuard],
  },
  {
    path: ':batchId',
    loadComponent: () => import('./batch-dashboard/batch-dashboard.component').then(m => m.BatchDashboardComponent),
    canActivate: [authGuard],
    canDeactivate: [batchLeaveGuard],
  },
];
