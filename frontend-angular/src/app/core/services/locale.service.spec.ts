import { TestBed } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LocaleService } from './locale.service';
import { StorageService } from './storage.service';
import { firstValueFrom, take, toArray } from 'rxjs';

describe('LocaleService', () => {
  let service: LocaleService;
  let translateService: TranslateService;

  // Mock navigator.language to be 'de' (unsupported) so default 'fr' is used
  const originalNavigator = navigator.language;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();

    // Mock navigator.language to unsupported language so 'fr' default is used
    Object.defineProperty(navigator, 'language', {
      value: 'de-DE',
      writable: true,
      configurable: true,
    });

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [LocaleService, StorageService],
    });

    translateService = TestBed.inject(TranslateService);
    service = TestBed.inject(LocaleService);
  });

  afterEach(() => {
    localStorage.clear();
    // Restore navigator.language
    Object.defineProperty(navigator, 'language', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe('initialization', () => {
    it('should default to French if no stored locale', () => {
      expect(service.getCurrentLocale()).toBe('fr');
    });

    it('should have locale defined', () => {
      expect(service.getCurrentLocale()).toBeDefined();
    });
  });

  describe('setLocale', () => {
    it('should change the current locale', () => {
      service.setLocale('en');
      expect(service.getCurrentLocale()).toBe('en');
    });

    it('should persist locale to storage', () => {
      service.setLocale('en');
      expect(localStorage.getItem('locale')).toBe('en');
    });

    it('should update document.documentElement.lang', () => {
      service.setLocale('en');
      expect(document.documentElement.lang).toBe('en');
    });

    it('should call translateService.use', () => {
      const useSpy = vi.spyOn(translateService, 'use');
      service.setLocale('en');
      expect(useSpy).toHaveBeenCalledWith('en');
    });
  });

  describe('trySetLocale', () => {
    it('should return true for supported locale', () => {
      expect(service.trySetLocale('en')).toBe(true);
      expect(service.getCurrentLocale()).toBe('en');
    });

    it('should return false for unsupported locale', () => {
      expect(service.trySetLocale('de')).toBe(false);
      expect(service.getCurrentLocale()).not.toBe('de');
    });
  });

  describe('getLocale$', () => {
    it('should emit current locale', async () => {
      const locale = await firstValueFrom(service.getLocale$());
      expect(['fr', 'en']).toContain(locale);
    });

    it('should emit new locale when changed', async () => {
      // Get first 2 emissions
      const emissionsPromise = firstValueFrom(
        service.getLocale$().pipe(take(2), toArray())
      );

      // Change locale
      service.setLocale('en');

      const emissions = await emissionsPromise;
      expect(emissions[1]).toBe('en');
    });
  });

  describe('getSupportedLocales', () => {
    it('should return fr and en', () => {
      const locales = service.getSupportedLocales();
      expect(locales).toContain('fr');
      expect(locales).toContain('en');
      expect(locales.length).toBe(2);
    });
  });

  describe('isSupported', () => {
    it('should return true for fr', () => {
      expect(service.isSupported('fr')).toBe(true);
    });

    it('should return true for en', () => {
      expect(service.isSupported('en')).toBe(true);
    });

    it('should return false for unsupported locale', () => {
      expect(service.isSupported('de')).toBe(false);
      expect(service.isSupported('es')).toBe(false);
      expect(service.isSupported('')).toBe(false);
    });
  });
});
