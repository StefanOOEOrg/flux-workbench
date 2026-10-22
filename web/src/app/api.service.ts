import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ImageSettings, Job, ProjectInfo, RenderRequest } from './models';

/**
 * Thin wrapper around the server's REST API (all URLs relative, under `/api`).
 * Every method only builds the request and returns the HttpClient observable -
 * no error handling, no state (the store does that).
 * Path segments (project ids, job ids) are passed through `encodeURIComponent`.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /** `GET /api/projects` -> `[{id, image_count}]`, newest first. */
  listProjects(): Observable<ProjectInfo[]> {
    return this.http.get<ProjectInfo[]>('/api/projects');
  }

  /** `POST /api/projects` with body `{name}` -> `{id}` of the new project. */
  createProject(name: string): Observable<{ id: string }> {
    return this.http.post<{ id: string }>('/api/projects', { name });
  }

  /** `DELETE /api/projects/{id}`. */
  deleteProject(id: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${encodeURIComponent(id)}`);
  }

  /** `GET /api/projects/{id}/images` -> image numbers ascending. */
  listImages(projectId: string): Observable<number[]> {
    return this.http.get<number[]>(`/api/projects/${encodeURIComponent(projectId)}/images`);
  }

  /** `GET /api/projects/{id}/images/{n}/settings`. */
  getSettings(projectId: string, n: number): Observable<ImageSettings> {
    return this.http.get<ImageSettings>(
      `/api/projects/${encodeURIComponent(projectId)}/images/${n}/settings`,
    );
  }

  /** `POST /api/projects/{id}/images/{n}/open` with body `{}` (server runs `open`). */
  openImage(projectId: string, n: number): Observable<void> {
    return this.http.post<void>(
      `/api/projects/${encodeURIComponent(projectId)}/images/${n}/open`,
      {},
    );
  }

  /** `PUT /api/projects/{id}/images/{n}/comment` with body `{comment}` (204, no body). */
  saveComment(projectId: string, n: number, comment: string): Observable<void> {
    return this.http.put<void>(
      `/api/projects/${encodeURIComponent(projectId)}/images/${n}/comment`,
      { comment },
    );
  }

  /**
   * `DELETE /api/projects/{id}/images/{n}` -> `void` (204, no body).
   * Deletes the PNG and the settings file of image `n` (no renumbering, #25).
   */
  deleteImage(projectId: string, n: number): Observable<void> {
    void projectId;
    void n;
    throw new Error('not implemented');
  }

  /**
   * URL for `<img src>`: `/api/projects/{id}/images/{n}` (no HTTP call).
   * `version` is appended as `?v={version}` when given, to bust the browser cache.
   */
  imageUrl(projectId: string, n: number, version?: number): string {
    const url = `/api/projects/${encodeURIComponent(projectId)}/images/${n}`;
    return version === undefined ? url : `${url}?v=${version}`;
  }

  /** `GET /api/queue` -> all jobs, oldest first. */
  listJobs(): Observable<Job[]> {
    return this.http.get<Job[]>('/api/queue');
  }

  /** `POST /api/queue` with body `{project_id, request}` -> the created job. */
  submitJob(projectId: string, request: RenderRequest): Observable<Job> {
    return this.http.post<Job>('/api/queue', { project_id: projectId, request });
  }

  /** `DELETE /api/queue/{jobId}`. */
  cancelJob(jobId: string): Observable<void> {
    return this.http.delete<void>(`/api/queue/${encodeURIComponent(jobId)}`);
  }
}
