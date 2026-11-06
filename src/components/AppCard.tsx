import { View, type ViewProps } from 'react-native';
import { useAppTheme } from '../theme';

export function AppCard({ style, ...props }: ViewProps) {
  const theme = useAppTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          padding: theme.spacing.md,
        },
        style,
      ]}
    />
  );
}
