import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { filter, map, switchMap, take } from 'rxjs';
import { environment } from '../../../environments/environment';

export const authGuard: CanActivateFn = () => {
  if (!environment.production && environment.skipAuth) {
    return true;
  }
  const auth = inject(AuthService);
  return auth.isLoading$.pipe(
    filter(isLoading => !isLoading),
    take(1),
    switchMap(() => auth.isAuthenticated$),
    map(isAuthenticated => {
      if (!isAuthenticated) {
        auth.loginWithRedirect();
        return false;
      }
      return true;
    })
  );
};
