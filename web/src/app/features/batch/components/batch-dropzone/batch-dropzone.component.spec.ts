import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BatchDropzoneComponent } from './batch-dropzone.component';

function createMockFile(name: string, type = 'application/pdf', size = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type });
}

describe('BatchDropzoneComponent', () => {
  let component: BatchDropzoneComponent;
  let fixture: ComponentFixture<BatchDropzoneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BatchDropzoneComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BatchDropzoneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  describe('valid files', () => {
    it('emits filesSelected with valid PDF files on drop', () => {
      const emitSpy = vi.spyOn(component.filesSelected, 'emit');
      const files = [createMockFile('a.pdf'), createMockFile('b.pdf')];

      component['processFiles'](files);

      expect(emitSpy).toHaveBeenCalledWith(files);
    });

    it('emits only valid files when mixed with invalid', () => {
      const emitSpy = vi.spyOn(component.filesSelected, 'emit');
      const validFile = createMockFile('good.pdf');
      const invalidFile = createMockFile('bad.docx', 'application/msword');

      component['processFiles']([validFile, invalidFile]);

      expect(emitSpy).toHaveBeenCalledWith([validFile]);
    });
  });

  describe('validation errors', () => {
    it('rejects non-PDF files with error message', () => {
      const emitSpy = vi.spyOn(component.filesSelected, 'emit');
      const file = createMockFile('document.docx', 'application/msword');

      component['processFiles']([file]);

      expect(component['errors']()).toHaveLength(1);
      expect(component['errors']()[0].fileName).toBe('document.docx');
      expect(component['errors']()[0].reason).toBe('Nie jest plikiem PDF');
      // No valid files → should not emit
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('rejects files exceeding 50MB', () => {
      const bigFile = createMockFile('huge.pdf', 'application/pdf', 51 * 1024 * 1024);

      component['processFiles']([bigFile]);

      expect(component['errors']()).toHaveLength(1);
      expect(component['errors']()[0].reason).toBe('Przekracza limit 50 MB');
    });

    it('rejects batch with more than 20 files', () => {
      const files = Array.from({ length: 21 }, (_, i) => createMockFile(`file-${i}.pdf`));

      component['processFiles'](files);

      expect(component['batchError']()).toBe('Maksymalnie 20 plików na raz.');
      expect(component['errors']()).toHaveLength(0);
    });

    it('accepts exactly 20 files', () => {
      const emitSpy = vi.spyOn(component.filesSelected, 'emit');
      const files = Array.from({ length: 20 }, (_, i) => createMockFile(`file-${i}.pdf`));

      component['processFiles'](files);

      expect(component['batchError']()).toBeNull();
      expect(emitSpy).toHaveBeenCalledWith(files);
    });
  });

  describe('drag and drop', () => {
    it('sets isDragOver on dragover', () => {
      const dragEvent = { preventDefault: vi.fn() } as unknown as DragEvent;

      component['onDragOver'](dragEvent);

      expect(component['isDragOver']()).toBe(true);
      expect(dragEvent.preventDefault).toHaveBeenCalled();
    });

    it('clears isDragOver on dragleave', () => {
      component['isDragOver'].set(true);

      component['onDragLeave']();

      expect(component['isDragOver']()).toBe(false);
    });
  });
});
