/**
 * Tokens UX 5.6 — paleta y escala extraídas literalmente del plan v1.1.
 * Consumidos por tailwind.config.ts y por código TS que pasa colores a
 * librerías que no aceptan classes (Recharts, inline styles excepcionales).
 *
 * Restricción WCAG: textMuted #A1A1AA tiene ratio 2.99 sobre surface #FFFFFF.
 * Cumple AA SOLO para texto large (≥14px peso 500+ o ≥18px peso 400+).
 * NUNCA usar textMuted en texto pequeño regular.
 */

export const palette = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F5',
  border: '#E4E4E7',
  borderStrong: '#D4D4D8',
  textPrimary: '#18181B',
  textSecondary: '#52525B',
  textMuted: '#A1A1AA',
  accent: '#18181B',
  accentHover: '#27272A',
  accentForeground: '#FAFAFA',
  success: '#16A34A',
  warning: '#CA8A04',
  error: '#DC2626',
  info: '#2563EB',
} as const;

export type PaletteToken = keyof typeof palette;

export const typography = {
  fontFamily: {
    sans: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '2rem',
    '4xl': '2.5rem',
    '5xl': '3.5rem',
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
  lineHeight: {
    heading: 1.2,
    body: 1.5,
  },
} as const;

export const spacing = {
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '6': '24px',
  '8': '32px',
  '12': '48px',
  '16': '64px',
} as const;

export const radii = {
  none: '0',
  sm: '4px',
  md: '6px',
  lg: '8px',
  full: '9999px',
} as const;

export const shadows = {
  card: '0 1px 2px rgba(0,0,0,0.04)',
  focus: '0 0 0 2px #18181B',
} as const;

export const transitions = {
  default: '150ms ease-out',
  modal: '200ms ease-out',
} as const;

export const iconSizes = {
  inline: 16,
  button: 20,
  header: 24,
  empty: 40,
} as const;

export const zIndex = {
  dropdown: 10,
  modalBackdrop: 50,
  modal: 51,
  banner: 60,
} as const;
