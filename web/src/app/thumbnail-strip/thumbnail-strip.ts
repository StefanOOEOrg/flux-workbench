import { Component, HostListener, inject, signal } from '@angular/core';

import { WorkbenchStore } from '../workbench.store';

/**
 * Thumbnail strip (top of the work area, full width up to the right window edge; issue #11).
 * Left -> right in the order of `store.images()` (ascending).
 *
 * Template (`thumbnail-strip.html`):
 * - For each n (track n): `<figure data-testid="thumb" class="thumb">` with
 *   `<img [src]="store.imageUrl(n)" loading="lazy" [alt]="'Image ' + n">` and
 *   `<figcaption class="n">{{ n }}</figcaption>` (badge top-left). Class `selected` when
 *   `n === store.selectedImage()`. `(click)` -> `store.selectImage(n)`,
 *   `(dblclick)` -> `store.openImage(n)`. `title="Double-click opens the image"`.
 * - After the images, for each job in `store.projectPendingJobs()` (track `job.id`):
 *   `<div data-testid="pending" class="thumb pending">{{ $index === 0 && job.status ===
 *   'running' ? 'running …' : 'queued …' }}</div>` (dashed border, no click handler).
 * - No project selected: `<p class="hint">Select a project</p>`; project without images and
 *   without pending jobs: `<p class="hint">No images yet – enter a prompt and render</p>`.
 *
 * CSS (`thumbnail-strip.css`): `:host { display: flex; gap: 10px; overflow-x: auto;
 * padding-bottom: 6px; }`; tiles `flex: 0 0 120px; height: 120px; border-radius: 10px;
 * overflow: hidden; border: 2px solid transparent`; `img { width: 100%; height: 100%;
 * object-fit: cover; }`; `.selected` border `--accent` + soft glow; badge like the mockup.
 *
 * CHANGES FOR #25 (right-click context menu to delete an image):
 * - Each `<figure>` additionally gets `(contextmenu)="openMenu(n, $event)"`.
 * - `readonly menu = signal<{ n: number; x: number; y: number } | null>(null)` holds the open
 *   menu (image under the cursor + mouse position); `null` = closed.
 * - `openMenu(n, event)`: `event.preventDefault()` (suppress the browser menu), then
 *   `menu.set({ n, x: event.clientX, y: event.clientY })`. It must NOT change the selection
 *   (no `store.selectImage`), so the image column and the form stay as they are.
 * - `closeMenu()`: `menu.set(null)`.
 * - `remove(n)`: `closeMenu()` first, then `await this.store.deleteImage(n)`. NO `confirmFn`,
 *   no question - deleting is immediate (Stefan's decision, see issue #25).
 * - `@HostListener('document:keydown.escape') onEscape()`: `closeMenu()`.
 * - Overlay at the END of the template, only while `menu()` is not null:
 *   `<div data-testid="context-backdrop" class="backdrop" tabindex="0" (click)="closeMenu()"
 *   (keydown.enter)="closeMenu()"></div>` (covers the viewport, so a click anywhere outside the
 *   menu closes it) and `<div data-testid="context-menu" class="menu"
 *   [style.left.px]="menu()!.x" [style.top.px]="menu()!.y">` with exactly one child
 *   `<button type="button" data-testid="context-delete" class="danger"
 *   (click)="remove(menu()!.n)">Delete image</button>`.
 * - CSS: `.backdrop { position: fixed; inset: 0; z-index: 40; }`,
 *   `.menu { position: fixed; z-index: 41; display: grid; min-width: 170px; padding: 4px;
 *   background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
 *   box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); }`,
 *   `.menu button { justify-content: flex-start; text-align: left; }`,
 *   `.danger { color: var(--rem); }`.
 *
 * CHANGES FOR #47 (keyboard access + a11y of the context menu):
 * - Keyboard opening: the template adds `(keydown)="onThumbKeydown(n, $event)"` to the figure.
 *   `onThumbKeydown(n, event)`: for `event.key === 'ContextMenu'` or `event.shiftKey &&
 *   event.key === 'F10'` -> `event.preventDefault()`, remember the figure as the trigger, open the
 *   menu at the figure's rect (`getBoundingClientRect()`, `x = round(left) + 8`,
 *   `y = round(top) + 8`) and focus the delete button. Any other key is ignored (Enter still
 *   selects, as before).
 * - Trigger bookkeeping: a private `trigger: HTMLElement | null` holds the element that opened the
 *   menu (figure for both mouse and keyboard). `openMenu` sets it from `event.currentTarget`.
 * - Focus management: after the menu renders, the delete button has focus (use
 *   `viewChild`/`afterNextRender` or an equivalent that works zoneless). `closeMenu()` closes and
 *   moves focus back to `trigger` when it still exists (`isConnected`), so Esc and a click on the
 *   backdrop both land on the thumbnail again. `remove(n)` closes first (that is allowed to lose
 *   focus when the deleted thumbnail disappears).
 * - A11y markup: the backdrop gets `aria-hidden="true"`, the menu `role="menu"` and the delete
 *   button `role="menuitem"` (plus `#menuItem` for the `viewChild`); test ids stay unchanged.
 */
@Component({
  selector: 'app-thumbnail-strip',
  templateUrl: './thumbnail-strip.html',
  styleUrl: './thumbnail-strip.css',
})
export class ThumbnailStrip {
  protected readonly store = inject(WorkbenchStore);

  /** Open context menu: image number under the cursor + mouse position; `null` = closed. */
  protected readonly menu = signal<{ n: number; x: number; y: number } | null>(null);

  /**
   * Right click on thumbnail `n`: suppress the browser menu and open the context menu at the
   * mouse position (`event.clientX` / `event.clientY`). Never changes the selection.
   */
  openMenu(n: number, event: MouseEvent): void {
    event.preventDefault();
    this.menu.set({ n, x: event.clientX, y: event.clientY });
  }

  /** Close the context menu. */
  closeMenu(): void {
    this.menu.set(null);
  }

  /** Close the context menu, then delete image `n` through the store (no confirmation). */
  async remove(n: number): Promise<void> {
    this.closeMenu();
    await this.store.deleteImage(n);
  }

  /** Esc anywhere on the page closes the menu. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }
}
