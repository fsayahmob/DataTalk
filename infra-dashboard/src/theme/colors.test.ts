import { describe, it, expect, beforeEach } from 'vitest';
import {
  theme,
  groupColors,
  getProjectColor,
  resetProjectColorCache,
  edgeColors,
  statusColors,
  typography,
} from './colors.js';

describe('theme colors', () => {
  it('should export all GCP-style theme colors', () => {
    // Backgrounds
    expect(theme.background).toBeDefined();
    expect(theme.surface).toBeDefined();
    expect(theme.surfaceVariant).toBeDefined();

    // Text colors
    expect(theme.textPrimary).toBeDefined();
    expect(theme.textSecondary).toBeDefined();
    expect(theme.textDisabled).toBeDefined();

    // Brand color
    expect(theme.primary).toBeDefined();
    expect(theme.primaryHover).toBeDefined();
    expect(theme.primaryLight).toBeDefined();

    // Semantic colors
    expect(theme.success).toBeDefined();
    expect(theme.warning).toBeDefined();
    expect(theme.error).toBeDefined();

    // Borders
    expect(theme.border).toBeDefined();
    expect(theme.borderLight).toBeDefined();
  });

  it('should use hex color format for theme colors', () => {
    expect(theme.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.success).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('should have Google Blue as primary color', () => {
    expect(theme.primary).toBe('#1a73e8');
  });

  it('should have light mode background', () => {
    expect(theme.background).toBe('#f8f9fa');
  });
});

describe('groupColors', () => {
  it('should have colors for all group types', () => {
    expect(groupColors.docker).toBeDefined();
    expect(groupColors.compose).toBeDefined();
    expect(groupColors.composeMissing).toBeDefined();
    expect(groupColors.network).toBeDefined();
    expect(groupColors.networkMissing).toBeDefined();
  });

  it('should have bg, border, and accent for each group', () => {
    expect(groupColors.docker.bg).toBeDefined();
    expect(groupColors.docker.border).toBeDefined();
    expect(groupColors.docker.accent).toBeDefined();

    expect(groupColors.compose.bg).toBeDefined();
    expect(groupColors.compose.border).toBeDefined();
    expect(groupColors.compose.accent).toBeDefined();
  });

  it('should use white background for groups', () => {
    expect(groupColors.docker.bg).toBe('#ffffff');
    expect(groupColors.compose.bg).toBe('#ffffff');
  });

  it('should use error colors for missing groups', () => {
    expect(groupColors.composeMissing.accent).toBe(theme.error);
    expect(groupColors.networkMissing.accent).toBe(theme.error);
  });
});

describe('getProjectColor', () => {
  beforeEach(() => {
    resetProjectColorCache();
  });

  it('should return consistent color for same project name', () => {
    const color1 = getProjectColor('myproject');
    const color2 = getProjectColor('myproject');
    expect(color1).toBe(color2);
  });

  it('should return different colors for different projects', () => {
    const color1 = getProjectColor('project-a');
    const color2 = getProjectColor('project-b');
    expect(color1).not.toBe(color2);
  });

  it('should use deterministic colors when allProjects is provided', () => {
    const allProjects = ['alpha', 'beta', 'gamma'];

    const colorAlpha = getProjectColor('alpha', allProjects);
    const colorBeta = getProjectColor('beta', allProjects);
    const colorGamma = getProjectColor('gamma', allProjects);

    // Each should get a different color
    expect(colorAlpha).not.toBe(colorBeta);
    expect(colorBeta).not.toBe(colorGamma);
    expect(colorAlpha).not.toBe(colorGamma);
  });

  it('should return hex color format', () => {
    const color = getProjectColor('test-project');
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('should cycle through palette for many projects', () => {
    const colors: string[] = [];
    for (let i = 0; i < 10; i++) {
      colors.push(getProjectColor(`project-${i}`));
    }

    // Should have some repeated colors after palette exhaustion
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBeLessThan(10);
    expect(uniqueColors.size).toBeGreaterThan(0);
  });

  it('should maintain cache after multiple calls', () => {
    const projects = ['a', 'b', 'c', 'a', 'b', 'c'];
    const colors = projects.map(p => getProjectColor(p));

    // Same projects should have same colors
    expect(colors[0]).toBe(colors[3]); // 'a' colors
    expect(colors[1]).toBe(colors[4]); // 'b' colors
    expect(colors[2]).toBe(colors[5]); // 'c' colors
  });
});

describe('resetProjectColorCache', () => {
  it('should clear the color cache', () => {
    // Get initial color
    const initialColor = getProjectColor('cached-project');
    expect(initialColor).toBeDefined();

    resetProjectColorCache();

    // After reset, calling same project again should work
    const colorAfterReset = getProjectColor('cached-project');
    expect(colorAfterReset).toBeDefined();
    expect(colorAfterReset).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('edgeColors', () => {
  it('should have colors for all edge types', () => {
    expect(edgeColors.connection).toBeDefined();
    expect(edgeColors.connectionMissing).toBeDefined();
    expect(edgeColors.volume).toBeDefined();
    expect(edgeColors.volumeMissing).toBeDefined();
  });

  it('should use hex format for connection colors', () => {
    expect(edgeColors.connection).toMatch(/^#[0-9a-f]{6}$/i);
    expect(edgeColors.connectionMissing).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('should use theme colors', () => {
    expect(edgeColors.connection).toBe(theme.success);
    expect(edgeColors.connectionMissing).toBe(theme.error);
    expect(edgeColors.volumeMissing).toBe(theme.error);
  });
});

describe('statusColors', () => {
  it('should have colors for all container states', () => {
    expect(statusColors.running).toBeDefined();
    expect(statusColors.stopped).toBeDefined();
    expect(statusColors.missing).toBeDefined();
  });

  it('should match theme semantic colors', () => {
    expect(statusColors.running).toBe(theme.success);
    expect(statusColors.stopped).toBe(theme.warning);
    expect(statusColors.missing).toBe(theme.error);
  });
});

describe('typography', () => {
  it('should export font family', () => {
    expect(typography.fontFamily).toBeDefined();
    expect(typography.fontFamily).toContain('system');
  });

  it('should export font sizes', () => {
    expect(typography.fontSize.xs).toBe('11px');
    expect(typography.fontSize.sm).toBe('12px');
    expect(typography.fontSize.base).toBe('13px');
    expect(typography.fontSize.md).toBe('14px');
    expect(typography.fontSize.lg).toBe('16px');
  });

  it('should export font weights', () => {
    expect(typography.fontWeight.normal).toBe(400);
    expect(typography.fontWeight.medium).toBe(500);
    expect(typography.fontWeight.semibold).toBe(600);
  });
});
