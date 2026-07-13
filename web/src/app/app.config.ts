import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { authHttpInterceptorFn, AuthService, provideAuth0 } from '@auth0/auth0-angular';
import { filter, take } from 'rxjs';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { CaseStore } from './core/store/case.store';

// Forces AuthService's construction before the Router resolves any route.
// Its constructor is self-subscribing and processes the Auth0 callback
// (code/state in the URL) — without this, the callback is only handled
// by accident, whenever the first route guard happens to inject it.
export function authInitializer(): void {
  if (!environment.skipAuth) {
    inject(AuthService);
  }
}

// Starts the recent-cases fetch as early as authentication state allows,
// running in parallel with route resolution and lazy-chunk loading instead
// of only starting after both finish.
export function recentCasesPrefetchInitializer(): void {
  performance.mark('clearkyc:recent-cases-prefetch:start');
  const caseStore = inject(CaseStore);

  if (environment.skipAuth) {
    caseStore.loadRecentCases();
    return;
  }

  inject(AuthService)
    .isAuthenticated$.pipe(filter(Boolean), take(1))
    .subscribe(() => caseStore.loadRecentCases());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(
      withXhr(),
      environment.skipAuth ? withInterceptors([]) : withInterceptors([authHttpInterceptorFn]),
    ),
    ...(environment.skipAuth
      ? []
      : [
          provideAuth0({
            domain: environment.auth0.domain,
            clientId: environment.auth0.clientId,
            authorizationParams: {
              redirect_uri: window.location.origin,
              audience: environment.auth0.audience,
            },
            httpInterceptor: {
              allowedList: [{ uriMatcher: (uri: string) => uri.startsWith('/api/') }],
            },
          }),
        ]),
    provideAppInitializer(authInitializer),
    provideAppInitializer(recentCasesPrefetchInitializer),
  ],
};
