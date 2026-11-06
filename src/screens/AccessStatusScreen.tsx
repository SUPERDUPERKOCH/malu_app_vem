import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../auth';
import { AppButton, AppCard, AppText, VemIcon } from '../components';
import { Screen } from '../components/Screen';
import { useAppTheme } from '../theme';

const statusCopy = {
  pending: {
    title: 'Acesso não liberado',
    description: 'Não encontramos uma compra do VEM vinculada a este e-mail. Para acessar os treinos, dieta e demais conteúdos, adquira o produto ou entre com o mesmo e-mail usado na compra.',
    checkoutLabel: 'Comprar acesso ao VEM',
  },
  suspended: {
    title: 'Pagamento pendente',
    description: 'Sua assinatura está com um pagamento pendente. Regularize a cobrança e depois verifique novamente.',
    checkoutLabel: 'Regularizar meu acesso',
  },
  cancelled: {
    title: 'Acesso encerrado',
    description: 'Não encontramos uma compra ativa para esta conta. Você pode renovar sua participação para voltar ao VEM.',
    checkoutLabel: 'Renovar acesso ao VEM',
  },
  active: {
    title: 'Acesso liberado',
    description: 'Sua assinatura está ativa.',
    checkoutLabel: 'Acessar o VEM',
  },
} as const;

const VEM_CHECKOUT_URL = 'https://pay.kiwify.com.br/MNAyuDA';

function formatDate(value: string, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** Status do pedido em português, a partir do que a Kiwify enviou no webhook. */
function orderStatusLabel(orderStatus: string | null, subscriptionStatus: string | null, refundedAt: string | null): string {
  if (refundedAt || orderStatus === 'refunded') return 'Compra reembolsada';
  if (orderStatus === 'chargedback') return 'Compra contestada no cartão';
  if (subscriptionStatus && ['waiting_payment', 'late', 'past_due'].includes(subscriptionStatus)) return 'Assinatura com pagamento pendente';
  if (subscriptionStatus === 'canceled' || subscriptionStatus === 'cancelled') return 'Assinatura cancelada';
  if (orderStatus === 'paid' || orderStatus === 'approved') return 'Pagamento aprovado';
  if (orderStatus === 'waiting_payment' || orderStatus === 'pending') return 'Aguardando pagamento';
  if (orderStatus === 'refused') return 'Pagamento recusado';
  return orderStatus ? `Status: ${orderStatus}` : 'Status não informado';
}

export function AccessStatusScreen() {
  const theme = useAppTheme();
  const { access, profile, profileError, refreshProfile, signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const status = profile?.subscriptionStatus ?? 'pending';
  const copy = statusCopy[status];

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await refreshProfile();
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
          <AppText variant="caption" weight="800">STATUS: {status.toUpperCase()}</AppText>
        </View>
        {!!profileError && (
          <AppText variant="caption" color={theme.colors.danger}>
            {profileError.startsWith('access_check_failed')
              ? 'Não foi possível validar sua compra na Kiwify agora. Confira a conexão e toque em Verificar novamente.'
              : 'Não foi possível atualizar o perfil agora. Tente novamente.'}
          </AppText>
        )}
      </AppCard>

      {access?.checkedKiwify && (
        <AppCard style={styles.card}>
          <AppText variant="caption" color={theme.colors.textMuted}>COMPRA NA KIWIFY</AppText>
          {access.order ? (
            <>
              <AppText weight="700">{access.order.productName ?? 'Pedido VEM'}</AppText>
              <AppText variant="caption" color={theme.colors.textMuted}>Pedido {access.order.orderId}</AppText>
              <AppText variant="caption">{orderStatusLabel(access.order.orderStatus, access.order.subscriptionStatus, access.order.refundedAt)}</AppText>
              {!!access.order.accessUntil && <AppText variant="caption" color={theme.colors.textMuted}>Acesso até {formatDate(access.order.accessUntil)}</AppText>}
              {!!access.order.approvedAt && <AppText variant="caption" color={theme.colors.textMuted}>Aprovado em {formatDate(access.order.approvedAt)}</AppText>}
            </>
          ) : (
            <AppText variant="caption">Nenhuma transação encontrada para este e-mail. Se você comprou com outro e-mail, entre com ele ou fale com a equipe VEM.</AppText>
          )}
          <AppText variant="caption" color={theme.colors.textMuted}>Verificado em {formatDate(access.checkedAt, true)}</AppText>
        </AppCard>
      )}

      <View style={[styles.warning, { backgroundColor: `${theme.colors.danger}12`, borderColor: `${theme.colors.danger}55` }]}>
        <VemIcon name="lock" size={22} color={theme.colors.danger} />
        <AppText variant="caption" color={theme.colors.danger} style={styles.warningText}>
          O conteúdo permanece bloqueado enquanto não houver uma compra ativa vinculada à sua conta.
        </AppText>
      </View>

      <View style={styles.actions}>
        <AppButton label="Verificar novamente" loading={refreshing} onPress={refresh} />
        <AppButton
          label={copy.checkoutLabel}
          variant="secondary"
          onPress={() => Linking.openURL(VEM_CHECKOUT_URL)}
        />
        <AppButton label="Sair da conta" variant="ghost" loading={leaving} onPress={leave} />
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
});
