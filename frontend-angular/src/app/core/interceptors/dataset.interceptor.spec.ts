import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { datasetInterceptor } from './dataset.interceptor';
import { DatasetService, Dataset } from '../services/dataset.service';
import { StorageService } from '../services/storage.service';

describe('DatasetInterceptor', () => {
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;
  let datasetService: DatasetService;

  const mockDataset: Dataset = {
    id: 'test-dataset-123',
    name: 'Test Dataset',
    description: 'Test',
    status: 'ready',
    isActive: true,
    rowCount: 100,
    tableCount: 5,
    sizeBytes: 1024,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([datasetInterceptor])),
        provideHttpClientTesting(),
        DatasetService,
        StorageService,
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
    datasetService = TestBed.inject(DatasetService);
  });

  afterEach(() => {
    httpTestingController.verify();
    localStorage.clear();
  });

  describe('with active dataset', () => {
    beforeEach(() => {
      datasetService.setActiveDataset(mockDataset);
    });

    it('should add dataset_id query param', () => {
      httpClient.get('/api/catalog').subscribe();

      const req = httpTestingController.expectOne(
        (request) => request.url === '/api/catalog' && request.params.has('dataset_id')
      );
      expect(req.request.params.get('dataset_id')).toBe('test-dataset-123');
      req.flush({});
    });

    it('should preserve existing query params', () => {
      httpClient.get('/api/catalog', { params: { page: '1' } }).subscribe();

      const req = httpTestingController.expectOne(
        (request) => request.url === '/api/catalog' && request.params.has('dataset_id')
      );
      expect(req.request.params.get('dataset_id')).toBe('test-dataset-123');
      expect(req.request.params.get('page')).toBe('1');
      req.flush({});
    });

    it('should work with POST requests', () => {
      httpClient.post('/api/analyze', { query: 'test' }).subscribe();

      const req = httpTestingController.expectOne(
        (request) => request.url === '/api/analyze' && request.params.has('dataset_id')
      );
      expect(req.request.params.get('dataset_id')).toBe('test-dataset-123');
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('excluded endpoints', () => {
    beforeEach(() => {
      datasetService.setActiveDataset(mockDataset);
    });

    it('should NOT add dataset_id for /datasets endpoint', () => {
      httpClient.get('/api/datasets').subscribe();

      const req = httpTestingController.expectOne(
        (request) => request.url === '/api/datasets'
      );
      expect(req.request.params.has('dataset_id')).toBe(false);
      req.flush({});
    });

    it('should NOT add dataset_id for /settings endpoint', () => {
      httpClient.get('/api/settings').subscribe();

      const req = httpTestingController.expectOne(
        (request) => request.url === '/api/settings'
      );
      expect(req.request.params.has('dataset_id')).toBe(false);
      req.flush({});
    });

    it('should NOT add dataset_id for /health endpoint', () => {
      httpClient.get('/api/health').subscribe();

      const req = httpTestingController.expectOne(
        (request) => request.url === '/api/health'
      );
      expect(req.request.params.has('dataset_id')).toBe(false);
      req.flush({});
    });
  });

  describe('without active dataset', () => {
    it('should NOT add dataset_id when no dataset is active', () => {
      // Ensure no active dataset
      datasetService.clearActiveDataset();

      httpClient.get('/api/catalog').subscribe();

      const req = httpTestingController.expectOne(
        (request) => request.url === '/api/catalog'
      );
      expect(req.request.params.has('dataset_id')).toBe(false);
      req.flush({});
    });
  });
});
