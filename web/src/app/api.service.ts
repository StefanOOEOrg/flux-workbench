import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ImageSettings, Job, RenderRequest } from './models';

/**
 * Thin wrapper around the server's REST API (all URLs relative, under `/api`).
 * Every method only builds the request and returns the HttpClient observable -
 * no error handling, no state (the store does that).
 * Path segments (project ids, job ids) are passed through `encodeURIComponent`.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /** `GET /api/projects` -> project ids, newest first. */
  listProjects(): Observable<string[]> {
    throw new Error('not implemented');
  }

  /** `POST /api/projects` with body `{name}` -> `{id}` of the new project. */
  createProject(name: string): Observable<{ id: string }> {
    throw new Error('not implemented');
  }

  /** `DELETE /api/projects/{id}`. */
  deleteProject(id: string): Observable<void> {
    throw new Error('not implemented');
  }

  /** `GET /api/projects/{id}/images` -> image numbers ascending. */
  listImages(projectId: string): Observable<number[]> {
    throw new Error('not implemented');
  }

  /** `GET /api/projects/{id}/images/{n}/settings`. */
  getSettings(projectId: string, n: number): Observable<ImageSettings> {
    throw new Error('not implemented');
  }

  /** `POST /api/projects/{id}/images/{n}/open` with body `{}` (server runs `open`). */
  openImage(projectId: string, n: number): Observable<void> {
    throw new Error('not implemented');
  }

  /**
   * URL for `<img src>`: `/api/projects/{id}/images/{n}` (no HTTP call).
   * `version` is appended as `?v={version}` when given, to bust the browser cache.
   */
  imageUrl(projectId: string, n: number, version?: number): string {
    throw new Error('not implemented');
  }

  /** `GET /api/queue` -> all jobs, oldest first. */
  listJobs(): Observable<Job[]> {
    throw new Error('not implemented');
  }

  /** `POST /api/queue` with body `{project_id, request}` -> the created job. */
  submitJob(projectId: string, request: RenderRequest): Observable<Job> {
    throw new Error('not implemented');
  }

  /** `DELETE /api/queue/{jobId}`. */
  cancelJob(jobId: string): Observable<void> {
    throw new Error('not implemented');
  }
}
