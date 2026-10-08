import { Component, inject } from '@angular/core';

import { WorkbenchStore } from '../workbench.store';

/**
 * Horizontal thumbnail strip, left -> right in the order of `store.images()` (ascending).
 *
 * Template (`thumbnail-strip.html`):
 * - For each n: `<figure data-testid="thumb">` with `<img [src]="store.imageUrl(n)"
 *   loading="lazy" [alt]="'Bild ' + n">` and `<figcaption>{{ n }}</figcaption>`.
 *   Class `selected` when `n === store.selectedImage()`.
 *   `(click)` -> `store.selectImage(n)`, `(dblclick)` -> `store.openImage(n)`.
 * - No project selected: `<p>Projekt auswählen</p>`; project without images:
 *   `<p>Noch keine Bilder</p>`.
 * CSS: `display: flex; overflow-x: auto; gap`; thumbnails 160px wide, `object-fit: contain`;
 * `.selected` with a visible border.
 */
@Component({
  selector: 'app-thumbnail-strip',
  templateUrl: './thumbnail-strip.html',
  styleUrl: './thumbnail-strip.css',
})
export class ThumbnailStrip {
  protected readonly store = inject(WorkbenchStore);
}
