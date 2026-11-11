import { forwardRef } from 'react';
import type { ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

/**
 * Scroll de formulários que acompanha exatamente o TextInput focado.
 * `bottomOffset` mantém uma pequena área livre entre o campo e o teclado.
 */
export const FormScrollView = forwardRef<KeyboardAwareScrollViewRef, ScrollViewProps & { bottomOffset?: number }>(function FormScrollView(
  { bottomOffset = 24, keyboardShouldPersistTaps = 'handled', keyboardDismissMode = 'interactive', ...props },
  ref,
) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      {...props}
    />
  );
});
