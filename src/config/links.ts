import { Platform } from 'react-native';

/**
 * Links públicos exigidos pelas lojas. Precisam abrir sem login, em HTTPS e não podem ser PDF.
 * `EXPO_PUBLIC_PRIVACY_POLICY_URL` permite trocar a URL por ambiente EAS; o padrão garante
 * que o link nunca suma da tela de assinatura (App Store 3.1.2).
 */
const env = (value: string | undefined, fallback: string): string => value?.trim() || fallback;

export const PRIVACY_POLICY_URL = env(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL, 'https://vemclube.com.br/privacidade');
export const ACCOUNT_DELETION_URL = env(process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL, 'https://vemclube.com.br/excluir-conta');
/**
 * iOS: EULA padrão da Apple (troque se o App Store Connect usar um EULA próprio).
 * Android: termos próprios do VEM — a página precisa estar publicada.
 */
export const TERMS_OF_USE_URL = env(
  process.env.EXPO_PUBLIC_TERMS_OF_USE_URL,
  Platform.OS === 'ios' ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/' : 'https://vemclube.com.br/termos',
);
export const SUPPORT_SITE_URL = 'https://vemclube.com.br';
export const SUPPORT_INSTAGRAM_URL = 'https://www.instagram.com/vem.clube/';

/** Aviso exigido para apps de saúde/fitness (App Store 1.4.1 e declaração de saúde do Google Play). */
export const HEALTH_DISCLAIMER = 'O VEM oferece conteúdo educacional de atividade física e alimentação. Não é um dispositivo médico e não realiza diagnóstico, tratamento, cura ou prevenção de doenças. Consulte profissionais de saúde antes de iniciar exercícios ou mudanças alimentares.';
