import { Component, ElementRef, computed, inject, signal } from '@angular/core';

const MIN_PANE_PX = 360;

@Component({
  selector: 'app-layout',
  templateUrl: './app-layout.component.html',
  styleUrl: './app-layout.component.scss',
})
export class AppLayoutComponent {
  private readonly host = inject(ElementRef);

  protected leftWidth = signal(50);
  protected isCollapsed = signal(false);

  protected layoutStyle = computed(() => ({
    '--pdf-pane-width': this.isCollapsed() ? '0%' : this.leftWidth() + '%',
  }));

  protected toggleCollapse(): void {
    this.isCollapsed.update(v => !v);
    if (!this.isCollapsed()) this.leftWidth.set(50);
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
