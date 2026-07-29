import { Component, EventEmitter, Output, input, signal } from '@angular/core';

const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 20;

export interface BatchFileError {
  fileName: string;
  reason: string;
}

@Component({
  selector: 'app-batch-dropzone',
  templateUrl: './batch-dropzone.component.html',
  styleUrl: './batch-dropzone.component.scss',
})
export class BatchDropzoneComponent {
  @Output() filesSelected = new EventEmitter<File[]>();
  readonly maxFiles = input(MAX_FILES);

  protected isDragOver = signal(false);
  protected errors = signal<BatchFileError[]>([]);
  protected batchError = signal<string | null>(null);

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  protected onDragLeave(): void {
    this.isDragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFiles(Array.from(files));
    }
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      this.processFiles(Array.from(files));
    }
    // Reset input so same files can be selected again
    input.value = '';
  }

  private processFiles(files: File[]): void {
    this.errors.set([]);
    this.batchError.set(null);

    if (files.length > this.maxFiles()) {
      const available = this.maxFiles();
      this.batchError.set(
        available === MAX_FILES
          ? `Maksymalnie ${MAX_FILES} plików na raz.`
          : available > 0
          ? `Możesz dodać jeszcze maksymalnie ${available} plików.`
          : `Osiągnięto limit ${MAX_FILES} plików.`,
      );
      return;
    }

    const valid: File[] = [];
    const errors: BatchFileError[] = [];

    for (const file of files) {
      if (file.type !== 'application/pdf') {
        errors.push({ fileName: file.name, reason: 'Nie jest plikiem PDF' });
      } else if (file.size > MAX_SIZE_BYTES) {
        errors.push({ fileName: file.name, reason: 'Przekracza limit 50 MB' });
      } else {
        valid.push(file);
      }
    }

    this.errors.set(errors);

    if (valid.length > 0) {
      this.filesSelected.emit(valid);
    }
  }
}
