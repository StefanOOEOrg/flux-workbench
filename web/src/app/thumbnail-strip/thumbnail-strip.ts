import { Component, inject } from '@angular/core';

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
 */
@Component({
  selector: 'app-thumbnail-strip',
  templateUrl: './thumbnail-strip.html',
  styleUrl: './thumbnail-strip.css',
})
export class ThumbnailStrip {
  protected readonly store = inject(WorkbenchStore);
}
