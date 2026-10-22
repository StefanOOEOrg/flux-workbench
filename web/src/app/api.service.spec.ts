import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists, creates and deletes projects', () => {
    api.listProjects().subscribe();
    http.expectOne({ method: 'GET', url: '/api/projects' }).flush([]);

    api.createProject('Mein Auto').subscribe();
    const create = http.expectOne({ method: 'POST', url: '/api/projects' });
    expect(create.request.body).toEqual({ name: 'Mein Auto' });
    create.flush({ id: '20261007-Mein_Auto' });

    api.deleteProject('20261007-a').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/projects/20261007-a' }).flush(null);
  });

  it('builds image urls', () => {
    api.listImages('20261007-a').subscribe();
    http.expectOne({ method: 'GET', url: '/api/projects/20261007-a/images' }).flush([1]);

    api.getSettings('20261007-a', 3).subscribe();
    http.expectOne('/api/projects/20261007-a/images/3/settings').flush({});

    api.openImage('20261007-a', 3).subscribe();
    http.expectOne({ method: 'POST', url: '/api/projects/20261007-a/images/3/open' }).flush(null);

    expect(api.imageUrl('20261007-a', 3)).toBe('/api/projects/20261007-a/images/3');
    expect(api.imageUrl('20261007-a', 3, 7)).toBe('/api/projects/20261007-a/images/3?v=7');
  });

  it('encodes path segments', () => {
    api.listImages('a/b').subscribe();
    http.expectOne('/api/projects/a%2Fb/images').flush([]);
  });

  it('saves a comment', () => {
    api.saveComment('20261007-a', 3, 'zu dunkel').subscribe();
    const req = http.expectOne({ method: 'PUT', url: '/api/projects/20261007-a/images/3/comment' });
    expect(req.request.body).toEqual({ comment: 'zu dunkel' });
    req.flush(null);
    api.saveComment('a/b', 1, '').subscribe();
    http.expectOne({ method: 'PUT', url: '/api/projects/a%2Fb/images/1/comment' }).flush(null);
  });

  it('deletes an image', () => {
    api.deleteImage('20261007-a', 3).subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/projects/20261007-a/images/3' }).flush(null);

    api.deleteImage('a/b', 1).subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/projects/a%2Fb/images/1' }).flush(null);
  });

  it('talks to the queue', () => {
    api.listJobs().subscribe();
    http.expectOne({ method: 'GET', url: '/api/queue' }).flush([]);

    api.submitJob('20261007-a', { prompt: 'p' }).subscribe();
    const submit = http.expectOne({ method: 'POST', url: '/api/queue' });
    expect(submit.request.body).toEqual({ project_id: '20261007-a', request: { prompt: 'p' } });
    submit.flush({});

    api.cancelJob('abc').subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/queue/abc' }).flush(null);
  });
});
