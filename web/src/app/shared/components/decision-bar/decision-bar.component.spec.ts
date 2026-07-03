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
      expect(btn?.textContent?.trim()).toBe('Zatwierdź');
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

  // ─── ANALYZED + isSubmitting — commit-btn disabled, selection enabled ────────

  describe('ANALYZED context with isSubmitting=true', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
      fixture.detectChanges();
      // isSubmitting is a component-local signal; set it directly on the instance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fixture.componentInstance as any).isSubmitting.set(true);
      fixture.detectChanges();
    });

    it('Commit decision button is disabled while submitting', () => {
      const btn = el.querySelector<HTMLButtonElement>('.commit-btn');
      expect(btn?.disabled).toBe(true);
    });

    it('Approve button remains enabled while submitting (selection still allowed)', () => {
      const btn = el.querySelector<HTMLButtonElement>('.decision-bar__btn--approve');
      expect(btn?.disabled).toBe(false);
    });

    it('Reject button remains enabled while submitting', () => {
      const btn = el.querySelector<HTMLButtonElement>('.decision-bar__btn--reject');
      expect(btn?.disabled).toBe(false);
    });

    it('Escalate button remains enabled while submitting', () => {
      const btn = el.querySelector<HTMLButtonElement>('.decision-bar__btn--escalate');
      expect(btn?.disabled).toBe(false);
    });
  });

  // ─── ANALYZED — commit flow ───────────────────────────────────────────────────

  describe('ANALYZED context — commit flow', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
      fixture.detectChanges();
    });

    it('Commit decision button is initially disabled', () => {
      const btn = el.querySelector<HTMLButtonElement>('.commit-btn');
      expect(btn).not.toBeNull();
      expect(btn?.disabled).toBe(true);
    });

    it('Commit decision button enabled after picking Approve', () => {
      el.querySelector<HTMLButtonElement>('.decision-bar__btn--approve')?.click();
      fixture.detectChanges();
      const commitBtn = el.querySelector<HTMLButtonElement>('.commit-btn');
      expect(commitBtn?.disabled).toBe(false);
    });

    it('Approve button gets active class after picking', () => {
      el.querySelector<HTMLButtonElement>('.decision-bar__btn--approve')?.click();
      fixture.detectChanges();
      expect(el.querySelector('.decision-bar__btn--approve')?.classList).toContain('decision-bar__btn--active');
    });

    it('picking Reject removes active class from Approve', () => {
      el.querySelector<HTMLButtonElement>('.decision-bar__btn--approve')?.click();
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('.decision-bar__btn--reject')?.click();
      fixture.detectChanges();
      expect(el.querySelector('.decision-bar__btn--approve')?.classList).not.toContain('decision-bar__btn--active');
      expect(el.querySelector('.decision-bar__btn--reject')?.classList).toContain('decision-bar__btn--active');
    });
  });

  // ─── ANALYZED — missing fields warning ───────────────────────────────────────

  describe('ANALYZED context — missing fields warning', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
    });

    it('shows warning when a field has missing value', () => {
      store.extractionFields.set([
        { fieldName: 'Company Name', value: 'Not Disclosed / Inferred Missing', citations: [] },
      ]);
      fixture.detectChanges();
      expect(el.querySelector('.decision-meta__warn')).not.toBeNull();
    });

    it('no warning when all fields have values', () => {
      store.extractionFields.set([
        { fieldName: 'Company Name', value: 'ACME Corp', citations: [] },
      ]);
      fixture.detectChanges();
      expect(el.querySelector('.decision-meta__warn')).toBeNull();
    });

    it('no warning when missing field has an override', () => {
      store.extractionFields.set([
        { fieldName: 'Company Name', value: 'Not Disclosed / Inferred Missing', citations: [] },
      ]);
      store.fieldOverrides.set({ 'Company Name': { originalValue: 'Not Disclosed / Inferred Missing', newValue: 'ACME Corp', justification: 'Verified' } });
      fixture.detectChanges();
      expect(el.querySelector('.decision-meta__warn')).toBeNull();
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

    it('falls back to a Polish label when lockedDecision is null (page-refresh scenario)', () => {
      // lockedDecision is null by default; must not leak the raw caseStatus() enum into the UI
      const strong = el.querySelector('.decision-bar--locked strong');
      expect(strong?.textContent?.trim()).toBe('Zablokowana');
    });

    it('no Approve/Reject/Escalate buttons', () => {
      expect(el.querySelector('.decision-bar__btn--approve')).toBeNull();
      expect(el.querySelector('.decision-bar__btn--reject')).toBeNull();
      expect(el.querySelector('.decision-bar__btn--escalate')).toBeNull();
    });
  });
});
