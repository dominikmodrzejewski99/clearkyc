import { TestBed } from '@angular/core/testing';
import { AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';
import { environment } from '../environments/environment';
import { CaseStore } from './core/store/case.store';
import { authInitializer, recentCasesPrefetchInitializer } from './app.config';

describe('authInitializer', () => {
  let originalSkipAuth: boolean;

  beforeEach(() => {
    originalSkipAuth = environment.skipAuth;
  });

  afterEach(() => {
    environment.skipAuth = originalSkipAuth;
  });

  it('constructs AuthService when skipAuth is false', () => {
    environment.skipAuth = false;
    const authServiceStub = {};

    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authServiceStub }],
    });

    expect(() => TestBed.runInInjectionContext(authInitializer)).not.toThrow();
    expect(TestBed.inject(AuthService)).toBe(authServiceStub);
  });

  it('does not require AuthService and does not throw when skipAuth is true', () => {
    environment.skipAuth = true;

    TestBed.configureTestingModule({ providers: [] });

    expect(() => TestBed.runInInjectionContext(authInitializer)).not.toThrow();
  });
});

describe('recentCasesPrefetchInitializer', () => {
  let originalSkipAuth: boolean;

  beforeEach(() => {
    originalSkipAuth = environment.skipAuth;
  });

  afterEach(() => {
    environment.skipAuth = originalSkipAuth;
    performance.clearMarks();
  });

  it('loads recent cases immediately when skipAuth is true, without an AuthService provider', () => {
    environment.skipAuth = true;
    const loadRecentCases = vi.fn();

    TestBed.configureTestingModule({
      providers: [{ provide: CaseStore, useValue: { loadRecentCases } }],
    });

    expect(() => TestBed.runInInjectionContext(recentCasesPrefetchInitializer)).not.toThrow();
    expect(loadRecentCases).toHaveBeenCalledTimes(1);
  });

  it('loads recent cases only after isAuthenticated$ emits true when skipAuth is false', () => {
    environment.skipAuth = false;
    const loadRecentCases = vi.fn();
    const isAuthenticated$ = new BehaviorSubject(false);

    TestBed.configureTestingModule({
      providers: [
        { provide: CaseStore, useValue: { loadRecentCases } },
        { provide: AuthService, useValue: { isAuthenticated$ } },
      ],
    });

    TestBed.runInInjectionContext(recentCasesPrefetchInitializer);
    expect(loadRecentCases).not.toHaveBeenCalled();

    isAuthenticated$.next(true);
    expect(loadRecentCases).toHaveBeenCalledTimes(1);
  });

  it('never loads recent cases if authentication never resolves', () => {
    environment.skipAuth = false;
    const loadRecentCases = vi.fn();
    const isAuthenticated$ = new BehaviorSubject(false);

    TestBed.configureTestingModule({
      providers: [
        { provide: CaseStore, useValue: { loadRecentCases } },
        { provide: AuthService, useValue: { isAuthenticated$ } },
      ],
    });

    expect(() => TestBed.runInInjectionContext(recentCasesPrefetchInitializer)).not.toThrow();
    expect(loadRecentCases).not.toHaveBeenCalled();
  });
});
