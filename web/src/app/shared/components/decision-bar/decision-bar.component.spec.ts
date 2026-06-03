import { TestBed, ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { EMPTY } from 'rxjs';
import { DecisionBarComponent } from './decision-bar.component';
import { CaseStore } from '../../../core/store/case.store';
import { DecisionService } from '../../../core/services/decision.service';
import { createCaseStoreMock, CaseStoreMock } from '../../../core/testing/case-store.mock';

describe('DecisionBarComponent', () => {
  let store: CaseStoreMock;
  let fixture: ComponentFixture<DecisionBarComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    store = createCaseStoreMock();
    await TestBed.configureTestingModule({
      imports: [DecisionBarComponent],
      providers: [
        { provide: CaseStore, useValue: store },
        { provide: DecisionService, useValue: { finalize: vi.fn().mockReturnValue(EMPTY) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DecisionBarComponent);
    el = fixture.nativeElement;
  });

  // ─── CREATED — renders nothing ────────────────────────────────────────────────

  describe('CREATED context', () => {
    beforeEach(() => {
      // Default: caseStatus='CREATED'
      fixture.detectChanges();
    });

    it('no decision buttons rendered', () => {
      const buttons = el.querySelectorAll('button');
      expect(buttons.length).toBe(0);
    });

    it('no locked view rendered', () => {
      expect(el.querySelector('.decision-bar--locked')).toBeNull();
    });
  });

  // ─── ANALYZING — renders nothing ──────────────────────────────────────────────

  describe('ANALYZING context (dead-state from backend)', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZING');
      fixture.detectChanges();
    });

    it('no decision buttons rendered', () => {
      expect(el.querySelectorAll('button').length).toBe(0);
    });

    it('no locked view rendered', () => {
      expect(el.querySelector('.decision-bar--locked')).toBeNull();
    });
  });

  // ─── ANALYZED — shows decision buttons ───────────────────────────────────────

  describe('ANALYZED context', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
      fixture.detectChanges();
    });

    it('Approve button is present and enabled', () => {
      const btn = el.querySelector<HTMLButtonElement>('.decision-bar__btn--approve');
      expect(btn).not.toBeNull();
      expect(btn?.disabled).toBe(false);
      expect(btn?.textContent?.trim()).toBe('Approve');
    });

    it('Reject button is present and enabled', () => {
      const btn = el.querySelector<HTMLButtonElement>('.decision-bar__btn--reject');
      expect(btn).not.toBeNull();
      expect(btn?.disabled).toBe(false);
    });

    it('Escalate button is present and enabled', () => {
      const btn = el.querySelector<HTMLButtonElement>('.decision-bar__btn--escalate');
      expect(btn).not.toBeNull();
      expect(btn?.disabled).toBe(false);
    });

    it('no locked view rendered', () => {
      expect(el.querySelector('.decision-bar--locked')).toBeNull();
    });
  });

  // ─── ANALYZED + isSubmitting — all buttons disabled ──────────────────────────

  describe('ANALYZED context with isSubmitting=true', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
      fixture.detectChanges();
      // isSubmitting is a component-local signal; set it directly on the instance
      (fixture.componentInstance as any).isSubmitting.set(true);
      fixture.detectChanges();
    });

    it('Approve button is disabled while submitting', () => {
      const btn = el.querySelector<HTMLButtonElement>('.decision-bar__btn--approve');
      expect(btn?.disabled).toBe(true);
    });

    it('Reject button is disabled while submitting', () => {
      const btn = el.querySelector<HTMLButtonElement>('.decision-bar__btn--reject');
      expect(btn?.disabled).toBe(true);
    });

    it('Escalate button is disabled while submitting', () => {
      const btn = el.querySelector<HTMLButtonElement>('.decision-bar__btn--escalate');
      expect(btn?.disabled).toBe(true);
    });
  });

  // ─── LOCKED — shows locked view, no decision buttons ─────────────────────────

  describe('LOCKED context', () => {
    beforeEach(() => {
      store.caseStatus.set('LOCKED');
      fixture.detectChanges();
    });

    it('locked view is visible', () => {
      expect(el.querySelector('.decision-bar--locked')).not.toBeNull();
    });

    it('locked view contains "Sprawa zablokowana" text', () => {
      const locked = el.querySelector('.decision-bar--locked');
      expect(locked?.textContent).toContain('Sprawa zablokowana');
    });

    it('falls back to showing caseStatus when lockedDecision is null (page-refresh scenario)', () => {
      // lockedDecision is null by default; template renders: lockedDecision() ?? caseStore.caseStatus()
      const strong = el.querySelector('.decision-bar--locked strong');
      expect(strong?.textContent?.trim()).toBe('LOCKED');
    });

    it('no Approve/Reject/Escalate buttons', () => {
      expect(el.querySelector('.decision-bar__btn--approve')).toBeNull();
      expect(el.querySelector('.decision-bar__btn--reject')).toBeNull();
      expect(el.querySelector('.decision-bar__btn--escalate')).toBeNull();
    });
  });
});
