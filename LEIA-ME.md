# VEM · Vida em Movimento — app para Expo Go

O app é o seu HTML original rodando dentro de um app nativo. Visual, telas e funções são os mesmos.

A camada nativa é escrita em TypeScript estrito. O HTML e sua ponte continuam como fontes Web e o arquivo `src/appHtml.ts` é gerado automaticamente.

## Migração para React Native

A nova estrutura nativa possui navegação por abas, tema claro/escuro, componentes-base e modelos de domínio tipados. Login, Início, Treino, Dieta, Evolução, VEM e Painel já têm telas nativas e compartilham sessão, hábitos, séries, cargas, alimentação, medidas, prêmios e preferências com a versão HTML. Fluxos especializados ainda oferecem acesso explícito à versão atual durante a transição.

```text
src/
├── components/   componentes visuais compartilhados
├── models/       contratos de perfil, treino, dieta, evolução e programa
├── navigation/   pilha principal, abas e parâmetros de rotas
├── screens/      telas nativas e tela de compatibilidade legada
└── theme/        cores, tipografia, espaçamentos e contexto de tema
```

## Como abrir no celular (uns 5 minutos)

1. No computador, instale o **Node.js** (versão LTS): https://nodejs.org
2. No celular, instale o **Expo Go** (App Store ou Play Store).
3. Descompacte esta pasta, abra o Terminal dentro dela e rode:

   ```bash
   npm install
   npx expo start
   ```

4. Vai aparecer um **QR code** no terminal.
   - **iPhone:** abra a Câmera e aponte pro QR.
   - **Android:** abra o Expo Go e toque em "Scan QR code".

O celular e o computador precisam estar **no mesmo Wi-Fi**. Se não abrir, rode `npm run tunnel` no lugar de `npx expo start`.

## Supabase

O cliente do Supabase usa as variáveis `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Copie `.env.example` para `.env` em uma nova instalação e preencha os valores do painel do Supabase. Nunca coloque uma chave `service_role` no aplicativo.

O schema versionado fica em `supabase/migrations`. A tabela `public.profiles` complementa `auth.users`, separa nome e sobrenome, cria perfis automaticamente e aplica políticas RLS. As instruções para aplicar as migrações estão em `supabase/README.md`.

## O que foi adaptado para o celular

- **Os dados ficam salvos no aparelho**: login, treinos, hábitos e fotos continuam lá mesmo se você fechar o app.
- **"Salvar imagem"** (frase do dia e resumo do treino) abre o compartilhar do celular: dá pra salvar na galeria ou mandar direto pro story ou pro WhatsApp.
- **Links** (site, Instagram, Google Agenda) abrem no navegador ou no app do celular.
- **Vibração** quando você conclui uma série ou o descanso acaba.
- **Botão voltar do Android** fecha a tela ou o modal aberto, em vez de sair do app.
- O app respeita o notch e a barra inferior do celular.

## Novidades desta versão

- **Abas:** Início · Treino · Dieta · Evolução · VEM · Painel. Os Prêmios agora ficam dentro da aba VEM.
- **Call do Meet:** a equipe cola o link em Painel › Área da equipe › Agenda e call. Ele aparece no Início e na aba VEM, com o botão "Entrar na call".
- **Lembretes:** a participante cria os dela (água, leitura, tarefas, com horário e dias) em Início › Agenda de hoje. A equipe cria lembretes pra todas em Área da equipe › Lembretes. Todos viram notificação no celular.
- **Carga em kg:** dá pra digitar o peso e continuar usando os botões −5 e +5.
- **Coach de corrida:** cada corrida registrada (distância, tempo, esforço e dor) alimenta o coach, que propõe o próximo desafio, com aumento de no máximo 10% por vez.
- **Dieta:** diário com foto dos pratos, contagem de calorias por dia e calendário do mês. Escolher uma opção do cardápio já soma as calorias no diário.

## Para trocar o HTML depois

1. Substitua `web/App_Vida_em_Movimento.html` pelo novo arquivo (mantenha o mesmo nome).
2. Rode `npm run build:html`.
3. Rode `npx expo start` de novo.

## Observações

- As fontes (Lora e DM Sans) vêm da internet. Sem conexão, o app usa fontes parecidas do sistema.
- Continua sendo o protótipo: login de demonstração e dados de exemplo, igual ao HTML.
- Para publicar na App Store ou na Play Store, o próximo passo é gerar o build com o EAS (`npx eas-cli build`).
