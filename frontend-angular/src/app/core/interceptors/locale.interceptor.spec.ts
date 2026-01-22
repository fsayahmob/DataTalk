import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { localeInterceptor } from './locale.interceptor';
import { LocaleService } from '../services/locale.service';
import { StorageService } from '../services/storage.service';

describe('LocaleInterceptor', () => {
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;
  let localeService: LocaleService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideHttpClient(withInterceptors([localeInterceptor])),
        provideHttpClientTesting(),
        LocaleService,
        StorageService,
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    localeService = TestBed.inject(LocaleService);
  });

  afterEach(() => {
    httpTestingController.verify();
    localStorage.clear();
  });

  it('should add Accept-Language header with current locale', () => {
    localeService.setLocale('fr');

    httpClient.get('/api/test').subscribe();

    const req = httpTestingController.expectOne('/api/test');
    expect(req.request.headers.get('Accept-Language')).toBe('fr');
    req.flush({});
  });

  it('should update header when locale changes', () => {
    localeService.setLocale('en');

    httpClient.get('/api/test').subscribe();

    const req = httpTestingController.expectOne('/api/test');
    expect(req.request.headers.get('Accept-Language')).toBe('en');
    req.flush({});
  });

  it('should work with POST requests', () => {
    localeService.setLocale('fr');

    httpClient.post('/api/test', { data: 'test' }).subscribe();

    const req = httpTestingController.expectOne('/api/test');
    expect(req.request.headers.get('Accept-Language')).toBe('fr');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('should preserve other headers', () => {
    localeService.setLocale('fr');

    httpClient
      .get('/api/test', {
        headers: { 'X-Custom-Header': 'custom-value' },
      })
      .subscribe();

    const req = httpTestingController.expectOne('/api/test');
    expect(req.request.headers.get('Accept-Language')).toBe('fr');
    expect(req.request.headers.get('X-Custom-Header')).toBe('custom-value');
    req.flush({});
  });
});
