import { TestBed, ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { Subject } from 'rxjs';
import { ExtractionFormComponent } from './extraction-form.component';
import { CaseStore } from '../../../../core/store/case.store';
import { ExtractionStreamService } from '../../../../core/services/extraction-stream.service';
import { createCaseStoreMock, CaseStoreMock } from '../../../../core/testing/case-store.mock';
import { ExtractionEvent, ExtractionField } from '../../../../core/models/extraction.models';

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

    it('shows Run analysis button', () => {
      expect(el.querySelector('.run-btn')).not.toBeNull();
    });

    it('Run analysis button is disabled (no PDF uploaded)', () => {
      const btn = el.querySelector<HTMLButtonElement>('.run-btn');
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

    it('shows Run analysis button', () => {
      expect(el.querySelector('.run-btn')).not.toBeNull();
    });

    it('Run analysis button is enabled', () => {
      const btn = el.querySelector<HTMLButtonElement>('.run-btn');
      expect(btn?.disabled).toBe(false);
    });

    it('button label contains "Run analysis"', () => {
      const btn = el.querySelector('.run-btn');
      expect(btn?.textContent).toContain('Uruchom analizę');
    });
  });

  // ─── STREAMING ───────────────────────────────────────────────────────────────

  describe('STREAMING context (isAnalyzing=true)', () => {
    beforeEach(() => {
      store.isAnalyzing.set(true);
      fixture.detectChanges();
    });

    it('Run analysis button is absent during streaming (design: stats shown instead)', () => {
      expect(el.querySelector('.run-btn')).toBeNull();
    });

    it('field stats are shown in pane header during streaming', () => {
      expect(el.querySelector('.ph-stat')).not.toBeNull();
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

    it('Run analysis button is ABSENT in pure ANALYZED state (no error)', () => {
      // Re-analysis is unreachable from ANALYZED without an analysisError — this is a contract.
      expect(el.querySelector('.run-btn')).toBeNull();
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

    it('Run analysis button is present (ANALYZED + error unlocks re-analysis)', () => {
      expect(el.querySelector('.run-btn')).not.toBeNull();
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

    it('Run analysis button is absent', () => {
      expect(el.querySelector('.run-btn')).toBeNull();
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

    it('Run analysis button is absent', () => {
      expect(el.querySelector('.run-btn')).toBeNull();
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

  // ─── R6 — Citation trust contract ────────────────────────────────────────────

  describe('R6 citation trust contract', () => {
    it('renders NDI marker when non-NDI value has no citations', () => {
      store.caseStatus.set('ANALYZED');
      store.extractionFields.set([
        { fieldName: 'Firma', value: 'ACME Corp.', citations: [] },
      ]);
      fixture.detectChanges();

      const valueText = el.querySelector('.extraction-form__value-text');
      expect(valueText?.textContent?.trim()).toBe('Nie ujawniono / Brak danych');
      expect(valueText?.textContent).not.toContain('ACME Corp.');
    });

    it('renders NDI marker for explicit NDI value with empty citations (normal NDI path)', () => {
      store.caseStatus.set('ANALYZED');
      store.extractionFields.set([
        { fieldName: 'Firma', value: 'Not Disclosed / Inferred Missing', citations: [] },
      ]);
      fixture.detectChanges();

      const valueText = el.querySelector('.extraction-form__value-text');
      expect(valueText?.textContent?.trim()).toBe('Nie ujawniono / Brak danych');
    });

    it('renders raw value when citations are present', () => {
      store.caseStatus.set('ANALYZED');
      store.extractionFields.set([
        { fieldName: 'Firma', value: 'ACME Corp.', citations: [{ page: 1, quote: 'ACME Corp. is registered...' }] },
      ]);
      fixture.detectChanges();

      const valueText = el.querySelector('.extraction-form__value-text');
      expect(valueText?.textContent?.trim()).toBe('ACME Corp.');
      expect(valueText?.textContent).not.toContain('Not Disclosed');
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

  // ─── Typewriter reveal (live SSE) ────────────────────────────────────────────

  describe('typewriter reveal (live SSE)', () => {
    let subject: Subject<ExtractionEvent>;

    beforeEach(async () => {
      vi.useFakeTimers();
      TestBed.resetTestingModule();
      subject = new Subject<ExtractionEvent>();
      store = createCaseStoreMock();
      store.appendField.mockImplementation((field: ExtractionField) =>
        store.extractionFields.update(fields => [...fields, field])
      );
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false } as MediaQueryList));

      await TestBed.configureTestingModule({
        imports: [ExtractionFormComponent],
        providers: [
          { provide: CaseStore, useValue: store },
          { provide: ExtractionStreamService, useValue: { streamAnalysis: vi.fn().mockReturnValue(subject.asObservable()) } },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ExtractionFormComponent);
      el = fixture.nativeElement;

      store.caseId.set('case-1');
      store.pdfBlob.set(new Blob([], { type: 'application/pdf' }));
      fixture.detectChanges();

      el.querySelector<HTMLButtonElement>('.run-btn')?.click();
      fixture.detectChanges();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('shows a strict prefix (shorter than full value) with no citations immediately after FieldExtracted', () => {
      subject.next({
        type: 'FieldExtracted',
        field: { fieldName: 'companyName', value: 'Northgate Holdings Limited', citations: [{ page: 1, quote: 'q' }] },
      });
      fixture.detectChanges();

      const valueText = el.querySelector('.extraction-form__value-text');
      const shownText = valueText?.textContent?.replace(' ', '').trim() ?? '';
      expect(shownText.length).toBeLessThan('Northgate Holdings Limited'.length);
      expect('Northgate Holdings Limited'.startsWith(shownText)).toBe(true);
      expect(el.querySelector('app-citation-badge')).toBeNull();
      expect(el.querySelector('.citation')).toBeNull();
    });

    it('shows the full value with citations once the reveal duration elapses', () => {
      subject.next({
        type: 'FieldExtracted',
        field: { fieldName: 'companyName', value: 'Northgate Holdings Limited', citations: [{ page: 1, quote: 'q' }] },
      });
      fixture.detectChanges();

      vi.advanceTimersByTime(2000);
      fixture.detectChanges();

      const valueText = el.querySelector('.extraction-form__value-text');
      expect(valueText?.textContent?.trim()).toBe('Northgate Holdings Limited');
      expect(el.querySelector('app-citation-badge')).not.toBeNull();
      expect(el.querySelector('.citation')).not.toBeNull();
    });

    it('renders fields set directly on the store (outside the live stream) fully formed with no partial reveal', () => {
      store.extractionFields.set([
        { fieldName: 'companyName', value: 'ACME Sp. z o.o.', citations: [{ page: 1, quote: 'q' }] },
      ]);
      fixture.detectChanges();

      const valueText = el.querySelector('.extraction-form__value-text');
      expect(valueText?.textContent?.trim()).toBe('ACME Sp. z o.o.');
      expect(el.querySelector('.cursor')).toBeNull();
    });

    it('bypasses the reveal entirely when prefers-reduced-motion is set', () => {
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true } as MediaQueryList));

      subject.next({
        type: 'FieldExtracted',
        field: { fieldName: 'companyName', value: 'Northgate Holdings Limited', citations: [{ page: 1, quote: 'q' }] },
      });
      fixture.detectChanges();

      const valueText = el.querySelector('.extraction-form__value-text');
      expect(valueText?.textContent?.trim()).toBe('Northgate Holdings Limited');
      expect(el.querySelector('.cursor')).toBeNull();
      expect(el.querySelector('app-citation-badge')).not.toBeNull();
    });

    it('stops the shared reveal interval when the component is destroyed mid-reveal', () => {
      subject.next({
        type: 'FieldExtracted',
        field: { fieldName: 'companyName', value: 'Northgate Holdings Limited', citations: [] },
      });
      fixture.detectChanges();
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      fixture.destroy();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
