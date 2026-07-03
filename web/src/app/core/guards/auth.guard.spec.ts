import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject, Observable } from 'rxjs';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let isLoading$: BehaviorSubject<boolean>;
  let isAuthenticated$: BehaviorSubject<boolean>;
  let loginWithRedirect: ReturnType<typeof vi.fn>;
  let originalProduction: boolean;
  let originalSkipAuth: boolean;

  beforeEach(() => {
    // authGuard short-circuits to `true` when environment.skipAuth is set (dev-mode bypass).
    // Force the production/non-skip path so the guard actually exercises AuthService below —
    // the default test environment (environment.ts) has skipAuth: true. The Angular unit-test
    // builder disallows vi.mock() on relative imports, so mutate the shared plain-object export
    // directly and restore it in afterEach.
    originalProduction = environment.production;
    originalSkipAuth = environment.skipAuth;
    environment.production = true;
    environment.skipAuth = false;

    isLoading$ = new BehaviorSubject(false);
    isAuthenticated$ = new BehaviorSubject(false);
    loginWithRedirect = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: {} },
        {
          provide: AuthService,
          useValue: { isLoading$, isAuthenticated$, loginWithRedirect },
        },
      ],
    });
  });

  afterEach(() => {
    environment.production = originalProduction;
    environment.skipAuth = originalSkipAuth;
  });

  function runGuard(): Observable<boolean> {
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never)) as Observable<boolean>;
  }

  it('allows activation without redirecting when authenticated', () => {
    isAuthenticated$.next(true);

    let result: boolean | undefined;
    runGuard().subscribe(value => (result = value));

    expect(result).toBe(true);
    expect(loginWithRedirect).not.toHaveBeenCalled();
  });

  it('redirects to Auth0 with appState.target=cases/new and blocks activation when unauthenticated', () => {
    isAuthenticated$.next(false);

    let result: boolean | undefined;
    runGuard().subscribe(value => (result = value));

    expect(result).toBe(false);
    expect(loginWithRedirect).toHaveBeenCalledTimes(1);
    expect(loginWithRedirect).toHaveBeenCalledWith({ appState: { target: 'cases/new' } });
  });
});
