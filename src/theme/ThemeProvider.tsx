import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import {
  darkColors,
  lightColors,
  radius,
  spacing,
  typography,
  type ThemeColors,
  type ThemeMode,
} from './tokens';

export interface AppTheme {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

const ThemeContext = createContext<AppTheme | null>(null);

export function VemThemeProvider({ children }: PropsWithChildren) {
  const mode: ThemeMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo<AppTheme>(
    () => ({
      mode,
      isDark: mode === 'dark',
      colors: mode === 'dark' ? darkColors : lightColors,
      spacing,
      radius,
      typography,
    }),
    [mode]
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useAppTheme deve ser usado dentro de VemThemeProvider');
  return theme;
}
