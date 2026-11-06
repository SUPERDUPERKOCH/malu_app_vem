import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { useAppTheme } from '../theme';
import { AppText } from './AppText';

interface AppTextInputProps extends TextInputProps {
  label: string;
  error?: string;
  rightAccessory?: React.ReactNode;
}

export const AppTextInput = forwardRef<TextInputInstance, AppTextInputProps>(
  ({ label, error, rightAccessory, style, ...props }, ref) => {
    const theme = useAppTheme();
    return (
      <View style={styles.wrapper}>
        <AppText variant="caption" color={theme.colors.textMuted} weight="700">{label}</AppText>
        <View
          style={[
            styles.field,
            {
              backgroundColor: theme.colors.surface,
              borderColor: error ? theme.colors.danger : theme.colors.border,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <TextInput
            ref={ref}
            {...props}
            placeholderTextColor={theme.colors.textMuted}
            selectionColor={theme.colors.primary}
            style={[styles.input, { color: theme.colors.text }, style]}
          />
          {rightAccessory}
        </View>
        {!!error && <AppText variant="caption" color={theme.colors.danger} accessibilityRole="alert">{error}</AppText>}
      </View>
    );
  }
);

AppTextInput.displayName = 'AppTextInput';

const styles = StyleSheet.create({
  wrapper: { gap: 5 },
  field: { minHeight: 48, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 12, fontSize: 16 },
});
