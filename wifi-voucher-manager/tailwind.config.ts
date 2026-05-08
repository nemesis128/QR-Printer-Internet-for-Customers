import type { Config } from 'tailwindcss';

import { palette, radii, shadows, spacing, transitions, typography, zIndex } from './src/renderer/styles/tokens.js';

const config: Config = {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ...palette },
      fontFamily: {
        sans: typography.fontFamily.sans.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
        mono: typography.fontFamily.mono.split(',').map((s) => s.trim().replace(/^'|'$/g, '')),
      },
      fontSize: { ...typography.fontSize },
      fontWeight: {
        regular: '400',
        medium: '500',
        semibold: '600',
      },
      spacing: { ...spacing },
      borderRadius: { ...radii },
      boxShadow: { card: shadows.card },
      transitionTimingFunction: { out: 'ease-out' },
      transitionDuration: {
        default: transitions.default.replace(' ease-out', ''),
        modal: transitions.modal.replace(' ease-out', ''),
      },
      zIndex: {
        dropdown: String(zIndex.dropdown),
        'modal-backdrop': String(zIndex.modalBackdrop),
        modal: String(zIndex.modal),
        banner: String(zIndex.banner),
      },
    },
  },
  safelist: ['bg-success', 'bg-warning', 'bg-error', 'bg-info'],
  plugins: [],
};

export default config;
