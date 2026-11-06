import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Inicio: undefined;
  Treino: undefined;
  Dieta: undefined;
  Evolucao: undefined;
  Vem: undefined;
  Painel: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  AccessStatus: undefined;
  Principal: NavigatorScreenParams<MainTabParamList> | undefined;
  Quiz: { refazer?: boolean } | undefined;
  AdminContent: undefined;
  Lembretes: { novo?: boolean } | undefined;
  Compartilhar: { mode: 'treino' | 'frase'; phrase?: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
