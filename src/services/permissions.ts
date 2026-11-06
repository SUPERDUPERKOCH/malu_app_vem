import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import { notificationPermission, requestNotificationPermission } from './notifications';

const ASKED_KEY = 'vem:startup-permissions-v1';

function explain(): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(
      'Duas permissões rápidas',
      'O celular vai perguntar se o VEM pode enviar notificações (lembretes de treino, água, refeições e encontros) e salvar imagens na galeria (a frase do dia e o resumo dos treinos). Você pode mudar isso depois nas configurações.',
      [{ text: 'Continuar', onPress: () => resolve() }],
      { cancelable: false },
    );
  });
}

/**
 * Pede, uma única vez após o login, as permissões de notificação e de salvar fotos,
 * para que os avisos do Android e do iOS apareçam logo no início.
 * Permissões já decididas (aceitas ou negadas) não são pedidas de novo pelo sistema.
 */
export async function askStartupPermissions(): Promise<void> {
  if (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) return;
  const [notifications, photos] = await Promise.all([
    notificationPermission().catch(() => 'undetermined' as const),
    MediaLibrary.getPermissionsAsync(true, ['photo']).catch(() => null),
  ]);
  const needsNotifications = notifications === 'undetermined';
  const needsPhotos = !photos || (!photos.granted && photos.canAskAgain);
  if (needsNotifications || needsPhotos) {
    await explain();
    if (needsNotifications) await requestNotificationPermission().catch(() => undefined);
    if (needsPhotos) await MediaLibrary.requestPermissionsAsync(true, ['photo']).catch(() => undefined);
  }
  await AsyncStorage.setItem(ASKED_KEY, new Date().toISOString()).catch(() => undefined);
}
