import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CaseNewComponent } from './case-new.component';
import { CaseService } from '../../core/services/case.service';
import { CaseStore } from '../../core/store/case.store';
import { createCaseStoreMock, CaseStoreMock } from '../../core/testing/case-store.mock';

describe('CaseNewComponent', () => {
  let store: CaseStoreMock;
  let fixture: ComponentFixture<CaseNewComponent>;
  let originalFetch: typeof fetch;

  beforeEach(async () => {
    store = createCaseStoreMock();
    originalFetch = globalThis.fetch;

    await TestBed.configureTestingModule({
      imports: [CaseNewComponent],
      providers: [
        provideRouter([]),
        { provide: CaseStore, useValue: store },
        {
          provide: CaseService,
          useValue: { listCases: () => of([]), createCase: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CaseNewComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance = () => fixture.componentInstance as any;

  it('loads a sample document into selectedFile on successful fetch', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      blob: () => Promise.resolve(blob),
    }) as unknown as typeof fetch;

    instance().loadSampleDocument(instance().sampleDocuments[0]);
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();

    const file = instance().selectedFile() as File | null;
    expect(file).not.toBeNull();
    expect(file?.name).toBe('northgate-holdings-articles.pdf');
    expect(file?.type).toBe('application/pdf');
    expect(instance().sampleErrorId()).toBeNull();
  });

  it('sets sampleErrorId and leaves selectedFile null when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch;

    const doc = instance().sampleDocuments[0];
    instance().loadSampleDocument(doc);
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(instance().selectedFile()).toBeNull();
    expect(instance().sampleErrorId()).toBe(doc.id);
    expect(instance().loadingSampleId()).toBeNull();
  });
});
