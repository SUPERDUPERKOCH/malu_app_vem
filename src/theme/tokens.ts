export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryContrast: string;
  brandSurface: string;
  brandText: string;
  accent: string;
  secondary: string;
  success: string;
  danger: string;
  overlay: string;
}

export const lightColors: ThemeColors = {
  background: '#F7EFE6',
  surface: '#FFF9F3',
  surfaceElevated: '#FFFFFF',
  text: '#281A1D',
  textMuted: '#745F64',
  border: '#E6D3D7',
  primary: '#6B1F33',
  primaryContrast: '#FFFFFF',
  brandSurface: '#6B1F33',
  brandText: '#FBEEE6',
  accent: '#C49A45',
  secondary: '#B76E5A',
  success: '#3E7A57',
  danger: '#B33A3A',
  overlay: 'rgba(40, 26, 29, 0.55)',
};

export const darkColors: ThemeColors = {
  background: '#1D1416',
  surface: '#281A1D',
  surfaceElevated: '#342329',
  text: '#FFF7F3',
  textMuted: '#CEB9BE',
  border: '#4A343A',
  primary: '#D18A9C',
  primaryContrast: '#2A0B13',
  brandSurface: '#5A1A2B',
  brandText: '#FBEEE6',
  accent: '#D8B062',
  secondary: '#E0A590',
  success: '#78B68D',
  danger: '#F08080',
  overlay: 'rgba(0, 0, 0, 0.68)',
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  caption: 12,
  body: 16,
  subtitle: 18,
  title: 24,
  display: 32,
} as const;
