import type { CSSProperties } from 'react';

/**
 * Design tokens — palette claire, moderne et border-radius uniformes.
 * sm = contrôles · md = cartes & panneaux · full = pilules
 */
export const theme = {
  colors: {
    bg: {
      base: '#fcfbff',
      gradientStart: '#ffffff',
      gradientEnd: '#f5f3ff',
      gradient: 'linear-gradient(160deg, #ffffff 0%, #f8f7ff 48%, #fcfbff 100%)',
      surface: 'rgba(15, 23, 42, 0.05)',
      hover: 'rgba(15, 23, 42, 0.05)',
      inactive: 'rgba(15, 23, 42, 0.05)',
      option: '#ffffff',
      btnSecondary: '#ffffff',
      btnSuccess: '#10b981',
      btnDanger: '#ef4444',
      surfaceHover: 'rgba(15, 23, 42, 0.08)',
      elevated: '#ffffff',
      overlay: 'rgba(15, 23, 42, 0.35)',
    },
    navbar: {
      bg: 'rgba(255, 255, 255, 0.88)',
      border: 'rgba(15, 23, 42, 0.08)',
    },
    accent: {
      primary: '#7c3aed',
      primaryHover: '#6d28d9',
      secondary: '#a78bfa',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
      soft: 'rgba(124, 58, 237, 0.12)',
      softBorder: 'rgba(124, 58, 237, 0.32)',
    },
    text: {
      primary: '#1e293b',
      secondary: '#475569',
      muted: '#64748b',
      faint: '#94a3b8',
      inverse: '#f8fafc',
      onAccent: '#ffffff',
      onCard: '#1e293b',
      onCardMuted: '#64748b',
      accent: '#7c3aed',
      subtle: '#aaa',
    },
    border: {
      subtle: 'rgba(15, 23, 42, 0.08)',
      medium: 'rgba(15, 23, 42, 0.14)',
      onCard: 'rgba(15, 23, 42, 0.08)',
      onCardStrong: 'rgba(15, 23, 42, 0.12)',
      input: '#444',
      light: '#ddd',
    },
    card: {
      default: '#ffffff',
      complete: { bg: '#ecfdf5', border: '#a7f3d0', text: '#059669' },
      cancelled: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
      pending: { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
      withdrawn: { bg: '#f8fafc', border: '#e2e8f0', text: '#334155' },
    },
    semantic: {
      success: '#059669',
      successDark: '#047857',
      warning: '#d97706',
      danger: '#dc2626',
      dangerDark: '#b91c1c',
      disabled: '#94a3b8',
      star: '#f59e0b',
      starInactive: '#cbd5e1',
    },
  },
  radius: {
    sm: '8px',
    md: '12px',
    full: '9999px',
  },
  shadow: {
    card: '0 4px 24px rgba(15, 23, 42, 0.08)',
    cardHover: '0 8px 32px rgba(15, 23, 42, 0.12)',
    accent: '0 4px 16px rgba(124, 58, 237, 0.22)',
    dropdown: '0 12px 40px rgba(15, 23, 42, 0.12)',
    navbar: '0 1px 0 rgba(15, 23, 42, 0.06)',
  },
} as const;

export type Theme = typeof theme;

/** Style unifié des titres de page (h1) */
export const pageTitleStyle: CSSProperties = {
  fontSize: '2.5em',
  color: theme.colors.accent.primary,
  fontWeight: 700,
  letterSpacing: '-0.02em',
};

/** Style unifié des boutons d'action principaux */
export const primaryButtonStyle: CSSProperties = {
  padding: '10px 20px',
  borderRadius: theme.radius.sm,
  border: 'none',
  background: theme.colors.accent.gradient,
  color: theme.colors.text.onAccent,
  fontSize: '1em',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'opacity 0.2s ease, transform 0.2s ease',
  boxShadow: theme.shadow.accent,
};
