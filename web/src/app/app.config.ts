import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authHttpInterceptorFn, provideAuth0 } from '@auth0/auth0-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authHttpInterceptorFn])),
    provideAuth0({
      domain: 'dev-3kjr48h52rpcpqhv.us.auth0.com',
      clientId: 'waNYiWlXzAxogZEudesES33AQWTPDyl4',
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: 'http://localhost:1999',
      },
      httpInterceptor: {
        allowedList: [{ uriMatcher: (uri: string) => uri.startsWith('/api/') }],
      },
    }),
  ],
};
