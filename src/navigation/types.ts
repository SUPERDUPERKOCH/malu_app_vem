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
  RedefinirSenha: undefined;
  AccessStatus: undefined;
  Principal: NavigatorScreenParams<MainTabParamList> | undefined;
  Quiz: { refazer?: boolean } | undefined;
  AdminContent: undefined;
  ExcluirConta: undefined;
  Lembretes: { novo?: boolean } | undefined;
  Compartilhar: { mode: 'treino' | 'frase'; phrase?: string } | { mode: 'corrida'; km: number; durationSeconds: number; pace: number; date: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
