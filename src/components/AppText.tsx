import { Platform, Text, type TextProps, type TextStyle } from 'react-native';
import { useAppTheme } from '../theme';

export type TextVariant = 'caption' | 'body' | 'subtitle' | 'title' | 'display';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  weight?: TextStyle['fontWeight'];
}

export function AppText({ variant = 'body', color, weight, style, ...props }: AppTextProps) {
  const theme = useAppTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: color ?? theme.colors.text,
          fontSize: theme.typography[variant],
          fontWeight: weight,
          fontFamily: variant === 'display' || variant === 'title' ? Platform.select({ ios: 'Georgia', android: 'serif' }) : undefined,
          lineHeight: Math.round(theme.typography[variant] * 1.35),
        },
        style,
      ]}
    />
  );
}
