import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAppTheme } from '../theme';

export function AuthLoadingScreen() {
  const theme = useAppTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.brandSurface }]}>
      <StatusBar style="light" />
      <ActivityIndicator size="large" color={theme.colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
