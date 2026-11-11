import { useEffect, useState } from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth';
import type { RootStackParamList } from '../navigation/types';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '../config/links';
import { AppButton, AppCard, AppText, VemIcon } from '../components';
import { Screen } from '../components/Screen';
import {
  STORE_NAME,
  canUseStoreSubscriptions,
  loadSubscriptionOffer,
  openSubscriptionManagement,
  purchaseSubscription,
  restorePurchases,
  subscriptionErrorMessage,
  type SubscriptionOffer,
} from '../services/subscriptions';
import { useAppTheme } from '../theme';

/**
 * Textos neutros: não se menciona nem se direciona para compra fora do app
 * (App Store 3.1.1 / 3.1.3 e política de pagamentos do Google Play).
 * Quem assinou por outro canal apenas entra com a mesma conta.
 */
const statusCopy = {
  pending: {
    title: 'Acesso não liberado',
    description: 'Assine o Clube VEM para acessar treinos, cardápio, evolução e demais conteúdos. Se você já é assinante, entre com o e-mail da sua conta VEM.',
  },
  suspended: {
    title: 'Pagamento pendente',
    description: 'Sua assinatura está com um pagamento pendente. Atualize a forma de pagamento em Gerenciar assinatura e depois toque em Verificar novamente.',
  },
  cancelled: {
    title: 'Acesso encerrado',
    description: 'Sua assinatura não está mais ativa. Assine novamente para voltar ao VEM.',
  },
  active: {
    title: 'Acesso liberado',
    description: 'Sua assinatura está ativa.',
  },
} as const;

const STATUS_LABELS: Record<keyof typeof statusCopy, string> = {
  pending: 'SEM ASSINATURA',
  suspended: 'PAGAMENTO PENDENTE',
  cancelled: 'ENCERRADA',
  active: 'ATIVA',
};

const isIOS = Platform.OS === 'ios';
const ACCOUNT_NAME = isIOS ? 'conta Apple' : 'conta Google Play';
const LEGAL_TEXT = isIOS
  ? 'O pagamento será cobrado na sua conta Apple ao confirmar a compra. A assinatura renova automaticamente pelo mesmo valor e período, a menos que seja cancelada pelo menos 24 horas antes do fim do período atual. Gerencie ou cancele nos Ajustes da sua conta Apple.'
  : 'O pagamento será cobrado na sua conta Google Play ao confirmar a compra. A assinatura renova automaticamente pelo mesmo valor e período até ser cancelada. Cancele a qualquer momento no Google Play, em Pagamentos e assinaturas; o acesso continua até o fim do período já pago.';

export function AccessStatusScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { profile, profileError, refreshProfile, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [offer, setOffer] = useState<SubscriptionOffer | null>(null);
  const [offerError, setOfferError] = useState('');
  const [offerLoading, setOfferLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const storeSubscriptions = canUseStoreSubscriptions();
  const status = profile?.subscriptionStatus ?? 'pending';
  const copy = statusCopy[status];

  const refreshOffer = async (): Promise<void> => {
    if (!storeSubscriptions) {
      setOffer(null);
      setOfferError(`A assinatura não foi configurada nesta build para a ${STORE_NAME}.`);
      return;
    }
    setOfferLoading(true);
    setOfferError('');
    try {
      setOffer(await loadSubscriptionOffer());
    } catch (error) {
      setOffer(null);
      setOfferError(subscriptionErrorMessage(error));
    } finally {
      setOfferLoading(false);
    }
  };

  useEffect(() => {
    void refreshOffer();
    // A oferta depende somente da loja/configuração embutida nesta build.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSubscriptions]);

  const manageSubscription = (): void => {
    void openSubscriptionManagement().catch(() => Alert.alert('Não foi possível abrir', `Abra as assinaturas pela sua ${ACCOUNT_NAME}.`));
  };

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      // Se a loja já possui uma assinatura (por exemplo, a compra concluiu e a
      // validação do servidor falhou), restaura e valida antes de reler o perfil.
      if (storeSubscriptions && status !== 'active') {
        await restorePurchases();
      }
      await refreshProfile();
    } catch (error) {
      Alert.alert('Não foi possível verificar', subscriptionErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const leave = async (): Promise<void> => {
    setLeaving(true);
    try {
      await signOut();
    } finally {
      setLeaving(false);
    }
  };

  const subscribe = async (): Promise<void> => {
    if (!offer) return;
    setPurchasing(true);
    try {
      const result = await purchaseSubscription(offer);
      if (result.cancelled) return;
      if (result.pending) {
        Alert.alert('Pagamento em processamento', 'Assim que a loja confirmar o pagamento, seu acesso será liberado. Depois toque em Verificar novamente.');
        return;
      }
      if (!result.active) { Alert.alert('Assinatura não concluída', `A ${STORE_NAME} não confirmou o acesso. Tente novamente.`); return; }
      await refreshProfile();
    } catch (error) {
      Alert.alert('Não foi possível assinar', subscriptionErrorMessage(error));
    } finally {
      setPurchasing(false);
    }
  };

  const restore = async (): Promise<void> => {
    setRestoring(true);
    try {
      if (!await restorePurchases()) {
        Alert.alert('Nenhuma assinatura encontrada', `Não encontramos uma assinatura ativa nesta ${ACCOUNT_NAME}.`);
        return;
      }
      await refreshProfile();
    } catch (error) {
      Alert.alert('Não foi possível restaurar', subscriptionErrorMessage(error));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Screen contentStyle={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <View style={[styles.icon, { backgroundColor: `${theme.colors.primary}18` }]}>
        <VemIcon name="lock" size={38} color={theme.colors.primary} />
      </View>

      <View style={styles.heading}>
        <AppText variant="display" weight="700" style={styles.center}>{copy.title}</AppText>
        <AppText color={theme.colors.textMuted} style={styles.center}>{copy.description}</AppText>
      </View>

      <AppCard style={styles.card}>
        <AppText variant="caption" color={theme.colors.textMuted}>CONTA</AppText>
        <AppText weight="700">{profile?.email ?? 'Carregando perfil…'}</AppText>
        <View style={[styles.status, { backgroundColor: `${theme.colors.accent}22` }]}>
          <AppText variant="caption" weight="800">STATUS: {STATUS_LABELS[status]}</AppText>
        </View>
        {!!profileError && (
          <AppText variant="caption" color={theme.colors.danger}>
            {profileError.startsWith('access_check_failed')
              ? 'Não foi possível verificar sua assinatura agora. Confira a conexão e toque em Verificar novamente.'
              : 'Não foi possível atualizar o perfil agora. Tente novamente.'}
          </AppText>
        )}
      </AppCard>

      <View style={[styles.warning, { backgroundColor: `${theme.colors.danger}12`, borderColor: `${theme.colors.danger}55` }]}>
        <VemIcon name="lock" size={22} color={theme.colors.danger} />
        <AppText variant="caption" color={theme.colors.danger} style={styles.warningText}>
          O conteúdo permanece bloqueado enquanto não houver uma assinatura ativa vinculada à sua conta.
        </AppText>
      </View>

      <AppCard style={[styles.card, styles.paywall, { borderColor: theme.colors.primary }]}>
        <View style={[styles.premiumIcon, { backgroundColor: `${theme.colors.primary}18` }]}>
          <VemIcon name="check" size={24} color={theme.colors.primary} />
        </View>
        <AppText variant="title" weight="700" style={styles.center}>{offer?.title ?? 'Assine o Clube VEM'}</AppText>
        <AppText variant="caption" color={theme.colors.textMuted} style={styles.center}>Treinos, cardápio, evolução, encontros e conteúdos completos em um só lugar.</AppText>
        <View style={styles.benefits}>
          {['Programa de treino indicado para você', 'Cardápio e diário alimentar', 'Mapa de evolução e conteúdos VEM'].map((benefit) => (
            <View key={benefit} style={styles.benefit}><VemIcon name="check" size={17} color={theme.colors.success} /><AppText variant="caption" style={styles.benefitText}>{benefit}</AppText></View>
          ))}
        </View>
        {offerLoading ? (
          <AppButton label={`Consultando a ${STORE_NAME}…`} loading disabled />
        ) : offer ? (
          <>
            <AppText variant="subtitle" weight="800" style={styles.center}>{offer.price} {offer.period}</AppText>
            <AppText variant="caption" color={theme.colors.textMuted} style={styles.center}>Assinatura com renovação automática{offer.period ? ` (${offer.period})` : ''}. Cancele quando quiser.</AppText>
            <AppButton label={isIOS ? 'Assinar com a Apple' : 'Assinar com o Google Play'} loading={purchasing} disabled={restoring} onPress={() => void subscribe()} />
          </>
        ) : (
          <>
            <AppText variant="caption" color={theme.colors.danger} style={styles.center}>{offerError || `A assinatura ainda não está disponível na ${STORE_NAME}.`}</AppText>
            <AppButton label="Tentar carregar novamente" variant="secondary" onPress={() => void refreshOffer()} />
          </>
        )}
        <AppButton label="Restaurar compras" variant="ghost" loading={restoring} disabled={purchasing || !storeSubscriptions} onPress={() => void restore()} />
        <AppText variant="caption" color={theme.colors.textMuted} style={styles.legal}>{LEGAL_TEXT}</AppText>
        <View style={styles.legalLinks}>
          <AppText variant="caption" color={theme.colors.primary} style={styles.underline} onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}>Termos de uso{isIOS ? ' (EULA)' : ''}</AppText>
          <AppText variant="caption" color={theme.colors.primary} style={styles.underline} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>Política de privacidade</AppText>
        </View>
      </AppCard>

      <View style={styles.actions}>
        <AppButton label="Verificar novamente" loading={refreshing} onPress={refresh} />
        <AppButton label="Gerenciar assinatura" variant="secondary" onPress={manageSubscription} />
        <AppButton label="Sair da conta" variant="ghost" loading={leaving} onPress={leave} />
        <AppButton label="Excluir minha conta" variant="ghost" onPress={() => navigation.navigate('ExcluirConta')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'center', alignItems: 'center', paddingVertical: 36 },
  icon: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center' },
  heading: { width: '100%', maxWidth: 460, alignItems: 'center', gap: 10 },
  center: { textAlign: 'center' },
  card: { width: '100%', maxWidth: 460, gap: 8 },
  status: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginTop: 4 },
  warning: { width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 14 },
  warningText: { flex: 1 },
  actions: { width: '100%', maxWidth: 460, gap: 10 },
  paywall: { alignItems: 'stretch', borderWidth: 1.5, gap: 12 },
  premiumIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  benefits: { gap: 8, marginVertical: 2 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitText: { flex: 1 },
  legal: { textAlign: 'center', lineHeight: 18 },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  underline: { textDecorationLine: 'underline' },
});
