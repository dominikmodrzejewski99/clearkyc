import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authHttpInterceptorFn, provideAuth0 } from '@auth0/auth0-angular';

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
  ],
};
