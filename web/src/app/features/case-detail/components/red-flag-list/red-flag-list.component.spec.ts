import { TestBed, ComponentFixture } from '@angular/core/testing';
import { RedFlagListComponent } from './red-flag-list.component';
import { CaseStore } from '../../../../core/store/case.store';
import { createCaseStoreMock, CaseStoreMock } from '../../../../core/testing/case-store.mock';

const FLAG_STUB = {
  category: 'Suspicious Director',
  description: 'Director appears on sanctions list.',
  citations: [],
};

describe('RedFlagListComponent', () => {
  let store: CaseStoreMock;
  let fixture: ComponentFixture<RedFlagListComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    store = createCaseStoreMock();
    await TestBed.configureTestingModule({
      imports: [RedFlagListComponent],
      providers: [
        { provide: CaseStore, useValue: store },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RedFlagListComponent);
    el = fixture.nativeElement;
  });

  // ─── CREATED — section hidden ─────────────────────────────────────────────────

  describe('CREATED context', () => {
    beforeEach(() => {
      // Default: caseStatus='CREATED'
      fixture.detectChanges();
    });

    it('entire red-flag section is absent', () => {
      expect(el.querySelector('.red-flag-list')).toBeNull();
    });
  });

  // ─── ANALYZED — empty flags ───────────────────────────────────────────────────

  describe('ANALYZED context with no flags', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
      // redFlags is [] by default
      fixture.detectChanges();
    });

    it('section is visible', () => {
      expect(el.querySelector('.red-flag-list')).not.toBeNull();
    });

    it('shows "Brak zidentyfikowanych red flag." message', () => {
      expect(el.querySelector('.no-flags')?.textContent).toContain('Brak zidentyfikowanych red flag.');
    });

    it('no flag items rendered', () => {
      expect(el.querySelectorAll('.red-flag-item').length).toBe(0);
    });
  });

  // ─── ANALYZED — with flags ────────────────────────────────────────────────────

  describe('ANALYZED context with flags', () => {
    beforeEach(() => {
      store.caseStatus.set('ANALYZED');
      store.redFlags.set([FLAG_STUB]);
      fixture.detectChanges();
    });

    it('section is visible', () => {
      expect(el.querySelector('.red-flag-list')).not.toBeNull();
    });

    it('renders flag item', () => {
      expect(el.querySelectorAll('.red-flag-item').length).toBe(1);
    });

    it('flag item shows category', () => {
      expect(el.querySelector('.category-badge')?.textContent).toContain('Suspicious Director');
    });

    it('no empty-state message when flags are present', () => {
      expect(el.querySelector('.no-flags')).toBeNull();
    });
  });

  // ─── LOCKED — with flags ──────────────────────────────────────────────────────

  describe('LOCKED context with flags', () => {
    beforeEach(() => {
      store.caseStatus.set('LOCKED');
      store.redFlags.set([FLAG_STUB]);
      fixture.detectChanges();
    });

    it('section is visible', () => {
      expect(el.querySelector('.red-flag-list')).not.toBeNull();
    });

    it('renders flag item', () => {
      expect(el.querySelectorAll('.red-flag-item').length).toBe(1);
    });
  });
});
