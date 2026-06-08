import { Component, EventEmitter, Output, signal } from '@angular/core';

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

@Component({
  selector: 'app-file-dropzone',
  templateUrl: './file-dropzone.component.html',
  styleUrl: './file-dropzone.component.scss',
})
 export class FileDropzoneComponent  {
  @Output() fileSelected = new EventEmitter<File>();

  protected isDragOver = signal(false);
  protected error = signal<string | null>(null);

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
    const file = event.dataTransfer?.files[0];
    if (file) this.validate(file);
  }

  protected onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.validate(file);
  }

  private validate(file: File): void {
    if (file.type !== 'application/pdf') {
      this.error.set('Only PDF files are supported.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      this.error.set('File exceeds the 50 MB limit.');
      return;
    }
    this.error.set(null);
    this.fileSelected.emit(file);
  }
}
