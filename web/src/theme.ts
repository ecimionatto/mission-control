// Design tokens ported from daily-train-app and crescendo-app theme directories.
// Palette: Okabe-Ito colorblind-safe, darkened for web dark-mode.

export const colors = {
  // Neutral scale (same as both apps)
  neutral: {
    50: '#FFFFFF',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
  // Okabe-Ito data colors (from DTrain)
  data: {
    blue: '#0072B2',     // hr zone 1 / emphasis
    green: '#009E73',    // hr zone 2 / success
    amber: '#B58900',    // tempo / warning
    vermillion: '#B54200', // threshold / error-warm
    magenta: '#9F1853',  // VO2max / critical
    accent: '#0E4F7C',   // deep navy accent
  },
  // Semantic feedback (from Crescendo)
  feedback: {
    success: '#047857',  // green-700
    warning: '#B45309',  // amber-700
    error: '#B91C1C',    // red-700
    muted: '#525252',    // neutral-600
  },
  // CI / workflow conclusion colors
  ci: {
    success: '#047857',
    failure: '#B91C1C',
    pending: '#B45309',
    none: '#525252',
    unknown: '#525252',
    cancelled: '#525252',
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const typography = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  size: { caption: 11, body: 13, title: 15, largeTitle: 20, display: 32 },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

// CSS custom properties injected into :root
export const cssVariables = `
  :root {
    --bg-page:     ${colors.neutral[950]};
    --bg-card:     ${colors.neutral[900]};
    --bg-card-alt: #1A1A1A;
    --border:      ${colors.neutral[800]};
    --border-dim:  #1E1E1E;

    --text-primary:   ${colors.neutral[100]};
    --text-secondary: ${colors.neutral[400]};
    --text-muted:     ${colors.neutral[600]};

    --accent:   ${colors.data.blue};
    --success:  ${colors.feedback.success};
    --warning:  ${colors.feedback.warning};
    --error:    ${colors.feedback.error};

    --font: ${typography.fontFamily};
    --radius: 6px;
  }
`;
