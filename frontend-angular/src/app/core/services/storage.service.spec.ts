import { TestBed } from '@angular/core/testing';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StorageService);

    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('get', () => {
    it('should return null for non-existent key', () => {
      expect(service.get('nonexistent')).toBeNull();
    });

    it('should return stored value', () => {
      localStorage.setItem('test-key', 'test-value');
      expect(service.get('test-key')).toBe('test-value');
    });
  });

  describe('set', () => {
    it('should store value in localStorage', () => {
      service.set('test-key', 'test-value');
      expect(localStorage.getItem('test-key')).toBe('test-value');
    });

    it('should overwrite existing value', () => {
      service.set('test-key', 'value1');
      service.set('test-key', 'value2');
      expect(localStorage.getItem('test-key')).toBe('value2');
    });
  });

  describe('remove', () => {
    it('should remove value from localStorage', () => {
      localStorage.setItem('test-key', 'test-value');
      service.remove('test-key');
      expect(localStorage.getItem('test-key')).toBeNull();
    });

    it('should not throw for non-existent key', () => {
      expect(() => {
        service.remove('nonexistent');
      }).not.toThrow();
    });
  });

  describe('getJson', () => {
    it('should return null for non-existent key', () => {
      expect(service.getJson('nonexistent')).toBeNull();
    });

    it('should parse and return JSON object', () => {
      const data = { name: 'test', value: 123 };
      localStorage.setItem('test-key', JSON.stringify(data));
      expect(service.getJson('test-key')).toEqual(data);
    });

    it('should return null for invalid JSON', () => {
      localStorage.setItem('test-key', 'not-valid-json{');
      expect(service.getJson('test-key')).toBeNull();
    });
  });

  describe('setJson', () => {
    it('should store object as JSON string', () => {
      const data = { name: 'test', value: 123 };
      service.setJson('test-key', data);
      expect(localStorage.getItem('test-key')).toBe(JSON.stringify(data));
    });

    it('should handle arrays', () => {
      const data = [1, 2, 3];
      service.setJson('test-key', data);
      expect(localStorage.getItem('test-key')).toBe('[1,2,3]');
    });
  });
});
