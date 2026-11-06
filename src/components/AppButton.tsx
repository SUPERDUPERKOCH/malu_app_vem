import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, type ViewStyle } from 'react-native';
import { useAppTheme } from '../theme';
import { AppText } from './AppText';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface AppButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: ViewStyle;
}

export function AppButton({ label, variant = 'primary', loading = false, disabled, style, ...props }: AppButtonProps) {
  const theme = useAppTheme();
  const isDisabled = disabled || loading;
  const backgroundColor =
    variant === 'primary' ? theme.colors.primary : variant === 'secondary' ? theme.colors.surfaceElevated : 'transparent';
  const borderColor = variant === 'primary' ? theme.colors.primary : theme.colors.border;
  const textColor = variant === 'primary' ? theme.colors.primaryContrast : theme.colors.text;

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderColor,
          borderRadius: theme.radius.md,
          opacity: isDisabled ? 0.5 : pressed ? 0.78 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <AppText color={textColor} weight="700">{label}</AppText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
