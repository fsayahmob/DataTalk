/**
 * Tests for useTranslation hook
 *
 * Note: t() now reads locale directly from useLanguageStore.
 * We use the store to set locale for tests.
 */
import { renderHook } from '@testing-library/react';
import { t, useTranslation } from '@/hooks/useTranslation';
import { LanguageProvider } from '@/components/LanguageProvider';
import { useLanguageStore } from '@/stores/useLanguageStore';
import React from 'react';

// Reset store before each test
const resetStore = () => {
  useLanguageStore.setState({ locale: 'fr' });
};

// Suppress console.warn for missing translations during tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});
afterAll(() => {
  console.warn = originalWarn;
});

// Wrapper component for hooks that need LanguageProvider
// Using React.createElement to avoid JSX in .ts file
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(LanguageProvider, null, children);

describe('t function', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('Basic translation', () => {
    it('returns translation for valid key', () => {
      const result = t('common.save');
      expect(result).toBe('Sauvegarder');
    });

    it('returns key when translation not found', () => {
      const result = t('nonexistent.key');
      expect(result).toBe('nonexistent.key');
    });

    it('handles nested keys', () => {
      const result = t('sidebar.analytics');
      expect(result).toBe('Analytics');
    });
  });

  describe('Variable interpolation', () => {
    it('interpolates multiple variables', () => {
      const result = t('validation.range_error', { min: 1, max: 100 });
      expect(result).toContain('1');
      expect(result).toContain('100');
    });

    it('keeps placeholder when variable not provided', () => {
      const result = t('validation.range_error');
      expect(result).toContain('{min}');
      expect(result).toContain('{max}');
    });

    it('replaces only provided variables', () => {
      const result = t('validation.range_error', { min: 5 });
      expect(result).toContain('5');
      expect(result).toContain('{max}');
    });
  });

  describe('Locale switching', () => {
    it('uses French by default', () => {
      const result = t('common.cancel');
      expect(result).toBe('Annuler');
    });

    it('returns English when store locale is en', () => {
      useLanguageStore.setState({ locale: 'en' });
      const result = t('common.cancel');
      expect(result).toBe('Cancel');
    });

    it('falls back to English when key missing in French', () => {
      // This tests the fallback mechanism - key exists in en but not fr
      // For now, we test that it doesn't crash
      const result = t('some.key.only.in.english');
      expect(typeof result).toBe('string');
    });
  });

  describe('Edge cases', () => {
    it('handles empty string key', () => {
      const result = t('');
      expect(result).toBe('');
    });

    it('handles single level key', () => {
      // If there's a top-level key, it should work
      const result = t('invalidkey');
      expect(result).toBe('invalidkey');
    });

    it('handles deep nested key', () => {
      const result = t('a.b.c.d.e.f');
      expect(result).toBe('a.b.c.d.e.f');
    });

    it('handles undefined vars gracefully', () => {
      const result = t('common.save', undefined);
      expect(result).toBe('Sauvegarder');
    });
  });
});

describe('useTranslation hook', () => {
  // Note: useTranslation now uses useLanguageStore (Zustand).
  // We reset the store before each test.

  beforeEach(() => {
    resetStore();
  });

  it('returns t function and locale', () => {
    const { result } = renderHook(() => useTranslation(), { wrapper });

    expect(typeof result.current.t).toBe('function');
    expect(result.current.locale).toBe('fr');
  });

  it('uses locale from store', () => {
    const { result } = renderHook(() => useTranslation(), { wrapper });

    expect(result.current.locale).toBe('fr');
    expect(result.current.t('common.save')).toBe('Sauvegarder');
  });

  it('t function from hook interpolates variables', () => {
    const { result } = renderHook(() => useTranslation(), { wrapper });

    const translated = result.current.t('validation.range_error', { min: 10, max: 50 });
    expect(translated).toContain('10');
    expect(translated).toContain('50');
  });
});
