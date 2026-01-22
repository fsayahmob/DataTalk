/**
 * Theme colors for infra-dashboard.
 * Design system inspired by Google Cloud Console.
 * Clean, professional, enterprise-grade UI.
 */

// GCP-inspired color palette
export const theme = {
  // Backgrounds - Light mode (GCP style)
  background: '#f8f9fa',        // Light gray background
  surface: '#ffffff',           // White cards/panels
  surfaceVariant: '#f1f3f4',    // Slightly darker surface

  // Text colors
  textPrimary: '#202124',       // Near black - primary text
  textSecondary: '#5f6368',     // Gray - secondary text
  textDisabled: '#9aa0a6',      // Light gray - disabled

  // Brand color (Google Blue)
  primary: '#1a73e8',           // Google Blue - main accent
  primaryHover: '#1557b0',      // Darker blue on hover
  primaryLight: '#e8f0fe',      // Light blue background

  // Semantic colors (muted, professional)
  success: '#1e8e3e',           // Green - healthy/running
  successLight: '#e6f4ea',      // Light green bg
  warning: '#f9ab00',           // Amber - warning/stopped
  warningLight: '#fef7e0',      // Light amber bg
  error: '#d93025',             // Red - error/missing
  errorLight: '#fce8e6',        // Light red bg

  // Borders
  border: '#dadce0',            // Standard border
  borderLight: '#e8eaed',       // Lighter border

  // Shadows (subtle)
  shadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
  shadowHover: '0 1px 3px 0 rgba(60,64,67,0.3), 0 4px 8px 3px rgba(60,64,67,0.15)',
} as const;

// Group node colors - subtle backgrounds with colored left border (GCP style)
export const groupColors = {
  docker: {
    bg: '#ffffff',
    border: theme.border,
    accent: theme.primary,        // Blue left border
  },
  compose: {
    bg: '#ffffff',
    border: theme.border,
    accent: theme.success,        // Green left border
  },
  composeMissing: {
    bg: theme.errorLight,
    border: theme.error,
    accent: theme.error,
  },
  network: {
    bg: theme.surfaceVariant,
    border: theme.borderLight,
    accent: theme.textSecondary,  // Gray accent for networks
  },
  networkMissing: {
    bg: theme.errorLight,
    border: theme.error,
    accent: theme.error,
  },
} as const;

// Subtle project colors for edges (muted, professional)
const PROJECT_PALETTE = [
  '#1a73e8', // Google Blue
  '#1e8e3e', // Green
  '#5f6368', // Gray
  '#a142f4', // Purple
  '#12b5cb', // Cyan
  '#e37400', // Orange
] as const;

// Cache for project color assignments
const projectColorCache = new Map<string, string>();

/**
 * Get a color for a project name.
 * Colors are assigned dynamically based on project index.
 */
export function getProjectColor(projectName: string, allProjects?: string[]): string {
  if (projectColorCache.has(projectName)) {
    return projectColorCache.get(projectName)!;
  }

  if (allProjects) {
    const index = allProjects.indexOf(projectName);
    if (index >= 0) {
      const color = PROJECT_PALETTE[index % PROJECT_PALETTE.length];
      projectColorCache.set(projectName, color);
      return color;
    }
  }

  const nextIndex = projectColorCache.size;
  const color = PROJECT_PALETTE[nextIndex % PROJECT_PALETTE.length];
  projectColorCache.set(projectName, color);
  return color;
}

/**
 * Reset project color cache (useful for testing).
 */
export function resetProjectColorCache(): void {
  projectColorCache.clear();
}

// Edge colors - subtle and professional
export const edgeColors = {
  connection: theme.success,
  connectionMissing: theme.error,
  volume: theme.textSecondary,
  volumeMissing: theme.error,
} as const;

// Status colors for containers
export const statusColors = {
  running: theme.success,
  stopped: theme.warning,
  missing: theme.error,
} as const;

// Typography
export const typography = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontSize: {
    xs: '11px',
    sm: '12px',
    base: '13px',
    md: '14px',
    lg: '16px',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
  },
} as const;
