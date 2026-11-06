import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

interface State { error: Error | null }

/**
 * Último recurso contra erros de renderização: em vez de tela branca ou de fechar o app,
 * mostra uma mensagem com a identidade VEM e permite tentar de novo.
 * Usa cores fixas porque pode ser exibido fora dos providers de tema.
 */
export class ErrorBoundary extends Component<PropsWithChildren, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sem serviço de monitoramento configurado: registra no console para os logs do dispositivo.
    console.error('[VEM] Erro não tratado na interface', error, info.componentStack);
  }

  private retry = (): void => this.setState({ error: null });

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.screen} accessibilityRole="alert">
        <View style={styles.badge}><Text style={styles.badgeText}>VEM</Text></View>
        <Text style={styles.title}>Algo deu errado</Text>
        <Text style={styles.text}>Não foi possível mostrar esta tela. Seus registros continuam salvos. Tente de novo; se o problema continuar, feche e abra o app.</Text>
        <Pressable accessibilityRole="button" onPress={this.retry} style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}>
          <Text style={styles.buttonText}>Tentar novamente</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#6B1F33', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  badge: { borderWidth: 2, borderColor: '#FBEEE6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  badgeText: { color: '#FBEEE6', fontSize: 22, fontWeight: '700', letterSpacing: 6 },
  title: { color: '#FBEEE6', fontSize: 24, fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), textAlign: 'center' },
  text: { color: '#FBEEE6', fontSize: 16, lineHeight: 22, textAlign: 'center', opacity: 0.9, maxWidth: 420 },
  button: { backgroundColor: '#C49A45', borderRadius: 12, paddingHorizontal: 22, paddingVertical: 14, minWidth: 220, alignItems: 'center' },
  buttonText: { color: '#2E1A20', fontSize: 16, fontWeight: '700' },
});
