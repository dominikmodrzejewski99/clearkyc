import { TestBed, ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { ExtractionFormComponent } from './extraction-form.component';
import { CaseStore } from '../../../../core/store/case.store';
import { ExtractionStreamService } from '../../../../core/services/extraction-stream.service';
import { createCaseStoreMock, CaseStoreMock } from '../../../../core/testing/case-store.mock';

describe('ExtractionFormComponent', () => {
  let store: CaseStoreMock;
  let fixture: ComponentFixture<ExtractionFormComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    store = createCaseStoreMock();
    await TestBed.configureTestingModule({
      imports: [ExtractionFormComponent],
      providers: [
        { provide: CaseStore, useValue: store },
        { provide: ExtractionStreamService, useValue: { streamAnalysis: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExtractionFormComponent);
    el = fixture.nativeElement;
  });

  // ─── CREATED-IDLE ────────────────────────────────────────────────────────────

  describe('CREATED-IDLE context (no PDF)', () => {
    beforeEach(() => {
      // Defaults: caseStatus='CREATED', isAnalyzing=false, pdfBlob=null
      fixture.detectChanges();
    });

    it('shows Analyze button', () => {
      expect(el.querySelector('.extraction-form__analyze-btn')).not.toBeNull();
    });

    it('Analyze button is disabled (no PDF uploaded)', () => {
      const btn = el.querySelector<HTMLButtonElement>('.extraction-form__analyze-btn');
      expect(btn?.disabled).toBe(true);
    });

    it('no Edit button (not ANALYZED)', () => {
      expect(el.querySelector('[aria-label="Edytuj wartość pola"]')).toBeNull();
    });

    it('no locked message', () => {
      expect(el.querySelector('.extraction-form__locked')).toBeNull();
    });

    it('no error banner', () => {
      expect(el.querySelector('.extraction-form__error-banner')).toBeNull();
    });
  });

  // ─── CREATED-READY ───────────────────────────────────────────────────────────

  describe('CREATED-READY context (PDF uploaded)', () => {
    beforeEach(() => {
      store.pdfBlob.set(new Blob(['pdf'], { type: 'application/pdf' }));
      fixture.detectChanges();
    });

    it('shows Analyze button', () => {
      expect(el.querySelector('.extraction-form__analyze-btn')).not.toBeNull();
    });

    it('Analyze button is enabled', () => {
      const btn = el.querySelector<HTMLButtonElement>('.extraction-form__analyze-btn');
      expect(btn?.disabled).toBe(false);
    });

    it('button label is "Analizuj"', () => {
      const btn = el.querySelector('.extraction-form__analyze-btn');
      expect(btn?.textContent?.trim()).toBe('Analizuj');
    });
  });

  // ─── STREAMING ───────────────────────────────────────────────────────────────

  describe('STREAMING context (isAnalyzing=true)', () => {
    beforeEach(() => {
      store.isAnalyzing.set(true);
      fixture.detectChanges();
    });

    it('shows Analyze button (caseStatus stays CREATED during stream)', () => {
      expect(el.querySelector('.extraction-form__analyze-btn')).not.toBeNull();
    });

    it('Analyze button is disabled during streaming', () => {
      const btn = el.querySelector<HTMLButtonElement>('.extraction-form__analyze-btn');
      expect(btn?.disabled).toBe(true);
    });

    it('button label changes to "Analizowanie..."', () => {
      const btn = el.querySelector('.extraction-form__analyze-btn');
      expect(btn?.textContent?.trim()).toBe('Analizowanie...');
    });

    it('no Edit button (isAnalyzing=true blocks it even when ANALYZED)', () => {
      expect(el.querySelector('[aria-label="Edytuj wartość pola"]')).toBeNull();
    });
  });

  // ─── ANALYZED ────────────────────────────────────────────────────────────────

  describe('ANALYZED context (successful analysis)', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
      store.extractionFields.set([
        { fieldName: 'Firma', value: 'ACME Sp. z o.o.', citations: [] },
      ]);
      fixture.detectChanges();
    });

    it('Analyze button is ABSENT in pure ANALYZED state (no error)', () => {
      // Re-analysis is unreachable from ANALYZED without an analysisError — this is a contract.
      expect(el.querySelector('.extraction-form__analyze-btn')).toBeNull();
    });

    it('Edit button is present', () => {
      expect(el.querySelector('[aria-label="Edytuj wartość pola"]')).not.toBeNull();
    });

    it('no locked message', () => {
      expect(el.querySelector('.extraction-form__locked')).toBeNull();
    });

    it('no error banner', () => {
      expect(el.querySelector('.extraction-form__error-banner')).toBeNull();
    });
  });

  // ─── ANALYZED-ERROR ──────────────────────────────────────────────────────────

  describe('ANALYZED-ERROR context (analysis error on re-analysis)', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
      store.analysisError.set('Błąd analizy. Spróbuj ponownie.');
      store.extractionFields.set([
        { fieldName: 'Firma', value: 'ACME Sp. z o.o.', citations: [] },
      ]);
      fixture.detectChanges();
    });

    it('Analyze button is present (ANALYZED + error unlocks re-analysis)', () => {
      expect(el.querySelector('.extraction-form__analyze-btn')).not.toBeNull();
    });

    it('error banner is visible', () => {
      expect(el.querySelector('.extraction-form__error-banner')).not.toBeNull();
    });

    it('Edit button is present (all 3 guard conditions met)', () => {
      // caseStatus='ANALYZED', isAnalyzing=false, editingField=null — all satisfied
      expect(el.querySelector('[aria-label="Edytuj wartość pola"]')).not.toBeNull();
    });
  });

  // ─── LOCKED ──────────────────────────────────────────────────────────────────

  describe('LOCKED context', () => {
    beforeEach(() => {
      store.caseStatus.set('LOCKED');
      fixture.detectChanges();
    });

    it('shows locked message', () => {
      const locked = el.querySelector('.extraction-form__locked');
      expect(locked).not.toBeNull();
      expect(locked?.textContent).toContain('Sprawa zakończona');
    });

    it('Analyze button is absent', () => {
      expect(el.querySelector('.extraction-form__analyze-btn')).toBeNull();
    });

    it('Edit button is absent', () => {
      expect(el.querySelector('[aria-label="Edytuj wartość pola"]')).toBeNull();
    });

    it('no error banner', () => {
      expect(el.querySelector('.extraction-form__error-banner')).toBeNull();
    });
  });

  // ─── DEAD-STATE ──────────────────────────────────────────────────────────────

  describe('DEAD-STATE context (caseStatus=ANALYZING from backend)', () => {
    // pre-existing gap: caseStatus='ANALYZING' from backend renders a blank form pane.
    // No spinner, no message, no controls. Document as contract, not bug.
    beforeEach(() => {
      store.caseStatus.set('ANALYZING');
      fixture.detectChanges();
    });

    it('Analyze button is absent', () => {
      expect(el.querySelector('.extraction-form__analyze-btn')).toBeNull();
    });

    it('locked message is absent', () => {
      expect(el.querySelector('.extraction-form__locked')).toBeNull();
    });

    it('Edit button is absent', () => {
      expect(el.querySelector('[aria-label="Edytuj wartość pola"]')).toBeNull();
    });

    it('error banner is absent', () => {
      expect(el.querySelector('.extraction-form__error-banner')).toBeNull();
    });
  });

  // ─── EDIT BUTTON — 3-condition guard ─────────────────────────────────────────

  describe('Edit button 3-condition guard', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
      store.extractionFields.set([
        { fieldName: 'Firma', value: 'ACME Sp. z o.o.', citations: [] },
      ]);
    });

    it('absent when isAnalyzing=true (guard condition 2 fails)', () => {
      store.isAnalyzing.set(true);
      fixture.detectChanges();
      expect(el.querySelector('[aria-label="Edytuj wartość pola"]')).toBeNull();
    });

    it('present when all 3 conditions are met', () => {
      // caseStatus='ANALYZED', isAnalyzing=false, editingField=null (component-local default)
      fixture.detectChanges();
      expect(el.querySelector('[aria-label="Edytuj wartość pola"]')).not.toBeNull();
    });
  });
});
