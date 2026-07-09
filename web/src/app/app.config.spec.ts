import { TestBed } from '@angular/core/testing';
import { AuthService } from '@auth0/auth0-angular';
import { environment } from '../environments/environment';
import { authInitializer } from './app.config';

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
