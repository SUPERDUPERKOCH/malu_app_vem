import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useAppTheme, VemThemeProvider } from './src/theme';
import { ErrorBoundary, VemLoaderProvider } from './src/components';
import { KeyboardProvider } from 'react-native-keyboard-controller';

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardProvider>
          <VemThemeProvider>
            <ThemedApp />
          </VemThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function ThemedApp() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surfaceElevated }}>
      <StatusBar style="light" />
      <NavigationBar style={theme.isDark ? 'light' : 'dark'} />
      <VemLoaderProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </VemLoaderProvider>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          left: 0,
          height: insets.top,
          backgroundColor: theme.colors.brandSurface,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          left: 0,
          height: insets.bottom,
          backgroundColor: theme.colors.surfaceElevated,
        }}
      />
    </View>
  );
}
