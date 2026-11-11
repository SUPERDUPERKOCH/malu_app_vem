import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavigationTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { VemIcon, type IconName } from '../components';
import { AuthLoadingScreen } from '../screens/AuthLoadingScreen';
import { AccessStatusScreen } from '../screens/AccessStatusScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { NutritionScreen } from '../screens/NutritionScreen';
import { EvolutionScreen } from '../screens/EvolutionScreen';
import { VemScreen } from '../screens/VemScreen';
import { PanelScreen } from '../screens/PanelScreen';
import { AdminContentScreen } from '../screens/AdminContentScreen';
import { DeleteAccountScreen } from '../screens/DeleteAccountScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { RemindersScreen } from '../screens/RemindersScreen';
import { ShareScreen } from '../screens/ShareScreen';
import { syncNotifications } from '../services/notifications';
import { askStartupPermissions } from '../services/permissions';
import { useAppTheme } from '../theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const tabLabels: Record<keyof MainTabParamList, string> = {
  Inicio: 'Início',
  Treino: 'Treino',
  Dieta: 'Dieta',
  Evolucao: 'Evolução',
  Vem: 'VEM',
  Painel: 'Painel',
};

const tabIcons: Record<keyof MainTabParamList, IconName> = {
  Inicio: 'home',
  Treino: 'workout',
  Dieta: 'nutrition',
  Evolucao: 'evolution',
  Vem: 'book',
  Painel: 'profile',
};

function MainTabs() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  // Reagenda os lembretes a cada abertura: horários, agenda de treino e encontros podem ter mudado.
  // Na primeira abertura, pede notificações e galeria; depois agenda os lembretes.
  useEffect(() => {
    void askStartupPermissions()
      .catch(() => undefined)
      .then(() => syncNotifications())
      .catch(() => undefined);
  }, []);
  const tabBarContentHeight = 62;
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surfaceElevated,
          borderTopColor: theme.colors.border,
          height: tabBarContentHeight + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarLabel: tabLabels[route.name],
        tabBarIcon: ({ color, focused }) => (
          <VemIcon name={tabIcons[route.name]} size={focused ? 25 : 23} color={color} strokeWidth={focused ? 2.2 : 1.8} />
        ),
      })}
    >
      <Tabs.Screen name="Inicio" component={HomeScreen} />
      <Tabs.Screen name="Treino" component={WorkoutScreen} />
      <Tabs.Screen name="Dieta" component={NutritionScreen} />
      <Tabs.Screen name="Evolucao" component={EvolutionScreen} />
      <Tabs.Screen name="Vem" component={VemScreen} />
      <Tabs.Screen name="Painel" component={PanelScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const theme = useAppTheme();
  const { loading, profile, recoveringPassword, session } = useAuth();
  const baseTheme = theme.isDark ? DarkTheme : DefaultTheme;
  const navigationTheme: NavigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surfaceElevated,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.danger,
    },
  };

  if (loading) return <AuthLoadingScreen />;

  // Disponível com ou sem assinatura ativa (Apple 5.1.1(v) / Google Play).
  const deleteAccountScreen = (
    <Stack.Screen
      name="ExcluirConta"
      component={DeleteAccountScreen}
      options={{
        title: 'Excluir minha conta',
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: theme.colors.surfaceElevated },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
      }}
    />
  );

  const hasAppAccess = !!profile?.active && (
    profile.role === 'admin' ||
    profile.role === 'coach' ||
    profile.subscriptionStatus === 'active'
  );

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ animation: 'fade' }}>
        {recoveringPassword ? (
          <Stack.Screen name="RedefinirSenha" component={ResetPasswordScreen} options={{ headerShown: false, gestureEnabled: false }} />
        ) : !session ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : hasAppAccess && profile.role === 'participant' && !profile.onboardingCompleted ? (
          <Stack.Screen name="Quiz" component={QuizScreen} options={{ headerShown: false, gestureEnabled: false }} />
        ) : hasAppAccess ? (
          <>
            <Stack.Screen name="Principal" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Quiz" component={QuizScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="Lembretes"
              component={RemindersScreen}
              options={{
                title: 'Horários e lembretes',
                headerBackButtonDisplayMode: 'minimal',
                headerStyle: { backgroundColor: theme.colors.surfaceElevated },
                headerTintColor: theme.colors.text,
                headerShadowVisible: false,
              }}
            />
            <Stack.Screen
              name="Compartilhar"
              component={ShareScreen}
              options={({ route }) => ({
                title: route.params.mode === 'treino' ? 'Treino concluído' : route.params.mode === 'corrida' ? 'Corrida concluída' : 'Imagem da frase',
                headerBackButtonDisplayMode: 'minimal',
                headerStyle: { backgroundColor: theme.colors.surfaceElevated },
                headerTintColor: theme.colors.text,
                headerShadowVisible: false,
              })}
            />
            {deleteAccountScreen}
            {profile.role === 'admin' && <Stack.Screen
              name="AdminContent"
              component={AdminContentScreen}
              options={{
                title: 'Conteúdo administrativo',
                headerBackButtonDisplayMode: 'minimal',
                headerStyle: { backgroundColor: theme.colors.surfaceElevated },
                headerTintColor: theme.colors.text,
                headerShadowVisible: false,
              }}
            />}
          </>
        ) : (
          <>
            <Stack.Screen name="AccessStatus" component={AccessStatusScreen} options={{ headerShown: false }} />
            {deleteAccountScreen}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabLabel: { fontSize: 10, fontWeight: '600' },
});
