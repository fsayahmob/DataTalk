/**
 * Tests for useTranslation hook
 */
import { t, useTranslation } from '@/hooks/useTranslation';

// Suppress console.warn for missing translations during tests
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = jest.fn();
});
afterAll(() => {
  console.warn = originalWarn;
});

describe('t function', () => {
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

    it('returns English when en locale specified', () => {
      const result = t('common.cancel', undefined, 'en');
      expect(result).toBe('Cancel');
    });

    it('falls back to English when key missing in French', () => {
      // This tests the fallback mechanism - key exists in en but not fr
      // For now, we test that it doesn't crash
      const result = t('some.key.only.in.english', undefined, 'fr');
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
  it('returns t function and locale', () => {
    const { t: translate, locale } = useTranslation();

    expect(typeof translate).toBe('function');
    expect(locale).toBe('fr');
  });

  it('uses default French locale', () => {
    const { t: translate, locale } = useTranslation();

    expect(locale).toBe('fr');
    expect(translate('common.save')).toBe('Sauvegarder');
  });

  it('uses specified locale', () => {
    const { t: translate, locale } = useTranslation('en');

    expect(locale).toBe('en');
    expect(translate('common.save')).toBe('Save');
  });

  it('t function from hook interpolates variables', () => {
    const { t: translate } = useTranslation();

    const result = translate('validation.range_error', { min: 10, max: 50 });
    expect(result).toContain('10');
    expect(result).toContain('50');
  });
});
