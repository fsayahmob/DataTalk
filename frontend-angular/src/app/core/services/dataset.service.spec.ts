import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatasetService, Dataset } from './dataset.service';
import { StorageService } from './storage.service';
import { firstValueFrom, skip, take, toArray } from 'rxjs';

describe('DatasetService', () => {
  let service: DatasetService;

  const mockDataset1: Dataset = {
    id: 'dataset-1',
    name: 'Test Dataset 1',
    description: 'Description 1',
    status: 'ready',
    isActive: true,
    rowCount: 1000,
    tableCount: 5,
    sizeBytes: 1024000,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  };

  const mockDataset2: Dataset = {
    id: 'dataset-2',
    name: 'Test Dataset 2',
    description: null,
    status: 'empty',
    isActive: false,
    rowCount: 0,
    tableCount: 0,
    sizeBytes: 0,
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  };

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [DatasetService, StorageService],
    });

    service = TestBed.inject(DatasetService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should have null active dataset initially', () => {
      expect(service.getActiveDataset()).toBeNull();
    });

    it('should have empty datasets list initially', async () => {
      const datasets = await firstValueFrom(service.getDatasets$());
      expect(datasets).toEqual([]);
    });
  });

  describe('setActiveDataset', () => {
    it('should set the active dataset', () => {
      service.setActiveDataset(mockDataset1);
      expect(service.getActiveDataset()).toEqual(mockDataset1);
    });

    it('should persist active dataset id to storage', () => {
      service.setActiveDataset(mockDataset1);
      expect(localStorage.getItem('active_dataset_id')).toBe('dataset-1');
    });

    it('should emit to activeDataset$ observable', async () => {
      const emissionsPromise = firstValueFrom(
        service.getActiveDataset$().pipe(take(2), toArray())
      );

      service.setActiveDataset(mockDataset1);

      const emissions = await emissionsPromise;
      expect(emissions[1]).toEqual(mockDataset1);
    });
  });

  describe('getActiveDatasetId', () => {
    it('should return null when no active dataset', () => {
      expect(service.getActiveDatasetId()).toBeNull();
    });

    it('should return active dataset id', () => {
      service.setActiveDataset(mockDataset1);
      expect(service.getActiveDatasetId()).toBe('dataset-1');
    });
  });

  describe('setDatasets', () => {
    it('should set the datasets list', async () => {
      const datasets = [mockDataset1, mockDataset2];

      // Get next emission after current
      const resultPromise = firstValueFrom(
        service.getDatasets$().pipe(skip(1), take(1))
      );

      service.setDatasets(datasets);

      const result = await resultPromise;
      expect(result).toEqual(datasets);
    });

    it('should restore active dataset from storage if available', () => {
      localStorage.setItem('active_dataset_id', 'dataset-2');
      service.setDatasets([mockDataset1, mockDataset2]);
      expect(service.getActiveDatasetId()).toBe('dataset-2');
    });

    it('should set first active dataset if no stored id', () => {
      service.setDatasets([mockDataset1, mockDataset2]);
      expect(service.getActiveDatasetId()).toBe('dataset-1'); // mockDataset1.isActive = true
    });

    it('should set first dataset if none is marked active', () => {
      const inactiveDatasets = [
        { ...mockDataset1, isActive: false },
        { ...mockDataset2, isActive: false },
      ];
      service.setDatasets(inactiveDatasets);
      expect(service.getActiveDatasetId()).toBe('dataset-1');
    });
  });

  describe('clearActiveDataset', () => {
    it('should clear active dataset', () => {
      service.setActiveDataset(mockDataset1);
      service.clearActiveDataset();
      expect(service.getActiveDataset()).toBeNull();
    });

    it('should remove from storage', () => {
      service.setActiveDataset(mockDataset1);
      service.clearActiveDataset();
      expect(localStorage.getItem('active_dataset_id')).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('should set loading state', async () => {
      const emissionsPromise = firstValueFrom(
        service.getLoading$().pipe(take(2), toArray())
      );

      service.setLoading(true);

      const emissions = await emissionsPromise;
      expect(emissions[1]).toBe(true);
    });
  });

  describe('updateDataset', () => {
    it('should update dataset in list', async () => {
      service.setDatasets([mockDataset1, mockDataset2]);

      const updatedDataset = { ...mockDataset1, name: 'Updated Name' };

      // Get next emission after update
      const resultPromise = firstValueFrom(
        service.getDatasets$().pipe(skip(1), take(1))
      );

      service.updateDataset(updatedDataset);

      const datasets = await resultPromise;
      const found = datasets.find((d) => d.id === 'dataset-1');
      expect(found?.name).toBe('Updated Name');
    });

    it('should update active dataset if same id', () => {
      // Must first add to datasets list for updateDataset to work
      service.setDatasets([mockDataset1, mockDataset2]);

      const updatedDataset = { ...mockDataset1, name: 'Updated Name' };
      service.updateDataset(updatedDataset);

      expect(service.getActiveDataset()?.name).toBe('Updated Name');
    });
  });

  describe('removeDataset', () => {
    it('should remove dataset from list', async () => {
      service.setDatasets([mockDataset1, mockDataset2]);

      // Get next emission after removal
      const resultPromise = firstValueFrom(
        service.getDatasets$().pipe(skip(1), take(1))
      );

      service.removeDataset('dataset-1');

      const datasets = await resultPromise;
      expect(datasets.find((d) => d.id === 'dataset-1')).toBeUndefined();
      expect(datasets.find((d) => d.id === 'dataset-2')).toBeDefined();
    });

    it('should clear active dataset if removed', () => {
      service.setActiveDataset(mockDataset1);
      service.removeDataset('dataset-1');
      expect(service.getActiveDataset()).toBeNull();
    });
  });
});
