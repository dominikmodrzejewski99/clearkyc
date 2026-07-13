import {
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';

const MIN_PANE_PX = 360;

@Component({
  selector: 'app-layout',
  templateUrl: './app-layout.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app-layout.component.scss',
})
export class AppLayoutComponent {
  private readonly host = inject(ElementRef);

  protected leftWidth = signal(50);

  protected layoutStyle = computed(() => ({
    '--pdf-pane-width': this.leftWidth() + '%',
  }));

  protected onResizerKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.leftWidth.update((w) => Math.min(70, w + (event.shiftKey ? 5 : 1)));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.leftWidth.update((w) => Math.max(30, w - (event.shiftKey ? 5 : 1)));
    }
  }

  protected onResizerMouseDown(startEvent: MouseEvent): void {
    startEvent.preventDefault();
    const containerWidth: number = this.host.nativeElement.getBoundingClientRect().width;
    const startX = startEvent.clientX;
    const startWidthPx = (containerWidth * this.leftWidth()) / 100;

    const onMouseMove = (e: MouseEvent) => {
      const newWidthPx = Math.max(
        MIN_PANE_PX,
        Math.min(containerWidth - MIN_PANE_PX, startWidthPx + (e.clientX - startX)),
      );
      this.leftWidth.set((newWidthPx / containerWidth) * 100);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
}
