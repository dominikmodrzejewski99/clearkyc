import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authHttpInterceptorFn, AuthService, provideAuth0 } from '@auth0/auth0-angular';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(
      environment.skipAuth
        ? withInterceptors([])
        : withInterceptors([authHttpInterceptorFn])
    ),
    ...(environment.skipAuth ? [] : [
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
    provideAppInitializer(() => {
      // Forces AuthService's construction before the Router resolves any route.
      // Its constructor is self-subscribing and processes the Auth0 callback
      // (code/state in the URL) — without this, the callback is only handled
      // by accident, whenever the first route guard happens to inject it.
      if (!environment.skipAuth) {
        inject(AuthService);
      }
    }),
  ],
};
