import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth';
import { AppNavigator } from './src/navigation/AppNavigator';
import { VemThemeProvider } from './src/theme/ThemeProvider';
import { ErrorBoundary, VemLoaderProvider } from './src/components';

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <VemThemeProvider>
          <VemLoaderProvider>
            <AuthProvider>
              <AppNavigator />
            </AuthProvider>
          </VemLoaderProvider>
        </VemThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
