-- Substitui os programas de academia pelos protocolos oficiais do Clube VEM.
-- Fonte editorial: "Protocolos de treino - Clube VEM.pdf" (07/11/2026).
-- Os programas de casa e o histórico das usuárias são preservados.

do $migration$
declare
  current_content jsonb;
  retained_programs jsonb;
  new_exercises jsonb := $json$
  [
    {"id":"agachamento-sem-peso","nome":"Agachamento sem peso","grupo":"Quadríceps e glúteo"},
    {"id":"elevacao-pelvica-no-solo","nome":"Elevação pélvica no solo","grupo":"Glúteo"},
    {"id":"agachamento-sumo-com-halter","nome":"Agachamento sumo com halter","grupo":"Quadríceps e glúteo"},
    {"id":"leg-press-horizontal","nome":"Leg press horizontal","grupo":"Quadríceps e glúteo"},
    {"id":"cadeira-extensora-unilateral","nome":"Cadeira extensora unilateral","grupo":"Quadríceps"},
    {"id":"cadeira-adutora","nome":"Cadeira adutora","grupo":"Adutores"},
    {"id":"cadeira-abdutora","nome":"Cadeira abdutora","grupo":"Glúteo"},
    {"id":"panturrilha-no-banco-solear","nome":"Panturrilha no banco solear","grupo":"Panturrilha"},
    {"id":"puxada-alta-aberta-pronada","nome":"Puxada alta aberta pronada","grupo":"Costas"},
    {"id":"remada-baixa-com-triangulo","nome":"Remada baixa com triângulo","grupo":"Costas"},
    {"id":"supino-reto-na-maquina","nome":"Supino reto na máquina","grupo":"Peito"},
    {"id":"biset-desenvolvimento-halter-e-elevacao-lateral","nome":"BI-SET: Desenvolvimento de ombro com halter + Elevação lateral","grupo":"Ombro"},
    {"id":"biset-rosca-halter-e-triceps-pulley-barra","nome":"BI-SET: Rosca direta com halter + Tríceps pulley com barra reta","grupo":"Braços"},
    {"id":"abdominal-supra-no-solo","nome":"Abdominal supra no solo","grupo":"Abdômen"},
    {"id":"cadeira-flexora","nome":"Cadeira flexora","grupo":"Posterior"},
    {"id":"mesa-flexora","nome":"Mesa flexora","grupo":"Posterior"},
    {"id":"flexao-de-joelho-unilateral-em-pe","nome":"Flexão de joelho unilateral em pé","grupo":"Posterior"},
    {"id":"gluteo-4-apoios-perna-90","nome":"Glúteo 4 apoios com perna em 90°","grupo":"Glúteo"},
    {"id":"elevacao-pelvica-no-solo-ponte","nome":"Elevação pélvica no solo (ponte)","grupo":"Glúteo"},
    {"id":"panturrilha-em-pe-step-unilateral","nome":"Panturrilha em pé no step unilateral","grupo":"Panturrilha"},
    {"id":"cadeira-extensora","nome":"Cadeira extensora","grupo":"Quadríceps"},
    {"id":"elevacao-pelvica-unilateral","nome":"Elevação pélvica unilateral","grupo":"Glúteo"},
    {"id":"agachamento-no-smith","nome":"Agachamento no smith","grupo":"Quadríceps e glúteo"},
    {"id":"leg-press-45","nome":"Leg press 45°","grupo":"Quadríceps e glúteo"},
    {"id":"afundo-com-halter","nome":"Afundo com halter","grupo":"Quadríceps e glúteo"},
    {"id":"puxada-aberta-pegada-anatomica","nome":"Puxada aberta pegada anatômica","grupo":"Costas"},
    {"id":"puxada-alta-com-triangulo","nome":"Puxada alta com triângulo","grupo":"Costas"},
    {"id":"remada-serrote-com-halter","nome":"Remada serrote com halter","grupo":"Costas"},
    {"id":"elevacao-lateral-com-halter","nome":"Elevação lateral com halter","grupo":"Ombro"},
    {"id":"rosca-direta-barra-polia-baixa","nome":"Rosca direta com barra na polia baixa","grupo":"Bíceps"},
    {"id":"abdominal-infra-na-paralela","nome":"Abdominal infra na paralela","grupo":"Abdômen"},
    {"id":"abducao-com-caneleira","nome":"Abdução com caneleira","grupo":"Glúteo"},
    {"id":"elevacao-pelvica-barra-ou-maquina","nome":"Elevação pélvica com barra ou na máquina","grupo":"Glúteo"},
    {"id":"gluteo-coice-na-polia","nome":"Glúteo coice na polia","grupo":"Glúteo"},
    {"id":"cadeira-abdutora-tronco-inclinado","nome":"Cadeira abdutora com tronco inclinado à frente","grupo":"Glúteo"},
    {"id":"mesa-flexora-rest-pause","nome":"Mesa flexora (rest-pause)","grupo":"Posterior"},
    {"id":"cadeira-flexora-unilateral","nome":"Cadeira flexora unilateral","grupo":"Posterior"},
    {"id":"stiff-com-barra-ou-halteres","nome":"Stiff com barra ou halteres","grupo":"Posterior e glúteo"},
    {"id":"supino-reto-maquina","nome":"Supino reto máquina","grupo":"Peito"},
    {"id":"crucifixo-maquina","nome":"Crucifixo máquina","grupo":"Peito"},
    {"id":"desenvolvimento-arnold","nome":"Desenvolvimento Arnold","grupo":"Ombro"},
    {"id":"elevacao-frontal-com-anilha","nome":"Elevação frontal com anilha","grupo":"Ombro"},
    {"id":"triceps-pulley-barra-reta","nome":"Tríceps pulley barra reta","grupo":"Tríceps"},
    {"id":"triceps-frances-corda-polia","nome":"Tríceps francês com corda na polia","grupo":"Tríceps"},
    {"id":"prancha-isometrica","nome":"Prancha isométrica","grupo":"Abdômen"},
    {"id":"agachamento-sumo-com-barra","nome":"Agachamento sumo com barra","grupo":"Quadríceps e glúteo"},
    {"id":"stiff-com-barra-ou-halter","nome":"Stiff com barra ou halter","grupo":"Posterior e glúteo"},
    {"id":"cadeira-flexora-drop-set","nome":"Cadeira flexora (drop-set)","grupo":"Posterior"},
    {"id":"extensao-de-quadril-na-polia","nome":"Extensão de quadril na polia","grupo":"Glúteo"},
    {"id":"panturrilha-no-leg-horizontal","nome":"Panturrilha no leg horizontal","grupo":"Panturrilha"},
    {"id":"pull-down-com-corda","nome":"Pull down com corda","grupo":"Costas"},
    {"id":"puxada-supinada","nome":"Puxada supinada","grupo":"Costas"},
    {"id":"elevacao-lateral-banco-45","nome":"Elevação lateral banco 45°","grupo":"Ombro"},
    {"id":"biset-remada-alta-rosca-direta-polia","nome":"BI-SET: Remada alta + Rosca direta barra polia","grupo":"Ombro e bíceps"},
    {"id":"biset-abdominal-corda-prancha-perna-elevada","nome":"BI-SET: Abdominal com corda na polia + Prancha com perna elevada","grupo":"Abdômen"},
    {"id":"agachamento-taca","nome":"Agachamento taça","grupo":"Quadríceps e glúteo"},
    {"id":"leg-press-45-unilateral","nome":"Leg press 45° unilateral","grupo":"Quadríceps e glúteo"},
    {"id":"passada-com-halter","nome":"Passada com halter","grupo":"Quadríceps e glúteo"},
    {"id":"coice-na-polia","nome":"Coice na polia","grupo":"Glúteo"},
    {"id":"extensao-quadril-banco-romano","nome":"Extensão de quadril no banco romano","grupo":"Glúteo"},
    {"id":"supino-inclinado-com-halter","nome":"Supino inclinado com halter","grupo":"Peito"},
    {"id":"desenvolvimento-maquina","nome":"Desenvolvimento máquina","grupo":"Ombro"},
    {"id":"elevacao-lateral-drop-set","nome":"Elevação lateral (drop-set)","grupo":"Ombro"},
    {"id":"biset-face-pull-elevacao-frontal-corda","nome":"BI-SET: Face pull + Elevação frontal com corda na polia","grupo":"Ombro"},
    {"id":"triceps-pulley-com-corda","nome":"Tríceps pulley com corda","grupo":"Tríceps"},
    {"id":"triceps-testa-com-barra","nome":"Tríceps testa com barra","grupo":"Tríceps"},
    {"id":"abdominal-bicicleta","nome":"Abdominal bicicleta","grupo":"Abdômen"}
  ]
  $json$::jsonb;
  new_programs jsonb := $json$
  [
    {
      "id":"academia-iniciante","nome":"Academia · Iniciante","modalidade":"academia","niveis":["iniciante"],"exemplo":false,
      "desc":"Protocolo Clube VEM para iniciantes: dois treinos inferiores e um treino superior.",
      "paraQuem":"Alunas iniciantes em musculação.","frequencia":"Musculação 3 a 4x por semana · cárdio 4 a 5x por semana","duracao":"Progressão contínua","precisa":"Academia","aquecimento":true,
      "semana":{"seg":"A","ter":"cardio|30–40 min","qua":"B","qui":"cardio|30–40 min","sex":"C","sab":"cardio|30–40 min","dom":"descanso"},
      "fases":[],"cardio":[["Frequência","4 a 5 vezes por semana"]],
      "regras":[["Ordem","Caso treine mais de 3x, repita o treino de superior em dias alternados com inferiores."],["Alongamentos","Faça os alongamentos indicados antes de cada treino."]],
      "treinos":[
        {"id":"academia-iniciante-A","letra":"A","nome":"Treino 1 · Quadríceps e glúteo","foco":"Quadríceps e glúteo","dias":["seg"],"mob":"inferior","itens":[
          {"id":"academia-iniciante-A-a1","exId":"agachamento-sem-peso","series":2,"reps":"10","carga":0,"kg":false,"bloco":"Ativação","descanso":30,"obs":""},
          {"id":"academia-iniciante-A-a2","exId":"elevacao-pelvica-no-solo","series":2,"reps":"10","carga":0,"kg":false,"bloco":"Ativação","descanso":30,"obs":""},
          {"id":"academia-iniciante-A-1","exId":"agachamento-sumo-com-halter","series":3,"reps":"12-10-8","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":"Progressão de carga entre as séries."},
          {"id":"academia-iniciante-A-2","exId":"leg-press-horizontal","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":""},
          {"id":"academia-iniciante-A-3","exId":"cadeira-extensora-unilateral","series":3,"reps":"12-15","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":"30 s entre pernas; 60 s após a série."},
          {"id":"academia-iniciante-A-4","exId":"cadeira-adutora","series":2,"reps":"12-15","carga":0,"kg":true,"bloco":"Treino","descanso":45,"obs":""},
          {"id":"academia-iniciante-A-5","exId":"cadeira-abdutora","series":2,"reps":"12-15","carga":0,"kg":true,"bloco":"Treino","descanso":45,"obs":""},
          {"id":"academia-iniciante-A-6","exId":"panturrilha-no-banco-solear","series":3,"reps":"12-15","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":""}
        ]},
        {"id":"academia-iniciante-B","letra":"B","nome":"Treino 2 · Superiores completo","foco":"Superiores completo","dias":["qua"],"mob":null,"itens":[
          {"id":"academia-iniciante-B-1","exId":"puxada-alta-aberta-pronada","series":3,"reps":"12-10-8","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":"Progressão de carga entre as séries."},
          {"id":"academia-iniciante-B-2","exId":"remada-baixa-com-triangulo","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":""},
          {"id":"academia-iniciante-B-3","exId":"supino-reto-na-maquina","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":""},
          {"id":"academia-iniciante-B-4","exId":"biset-desenvolvimento-halter-e-elevacao-lateral","series":3,"reps":"10 cada","carga":0,"kg":true,"bloco":"Bi-set","descanso":60,"obs":"Sem descanso entre os dois exercícios."},
          {"id":"academia-iniciante-B-5","exId":"biset-rosca-halter-e-triceps-pulley-barra","series":3,"reps":"10-12 cada","carga":0,"kg":true,"bloco":"Bi-set","descanso":60,"obs":"Sem descanso entre os dois exercícios."},
          {"id":"academia-iniciante-B-6","exId":"abdominal-supra-no-solo","series":3,"reps":"15","carga":0,"kg":false,"bloco":"Treino","descanso":45,"obs":""}
        ]},
        {"id":"academia-iniciante-C","letra":"C","nome":"Treino 3 · Posterior e glúteo","foco":"Posterior e glúteo","dias":["sex"],"mob":"inferior","itens":[
          {"id":"academia-iniciante-C-a1","exId":"elevacao-pelvica-no-solo","series":2,"reps":"12","carga":0,"kg":false,"bloco":"Ativação","descanso":30,"obs":""},
          {"id":"academia-iniciante-C-1","exId":"cadeira-flexora","series":3,"reps":"12-10-8","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":"Progressão de carga entre as séries."},
          {"id":"academia-iniciante-C-2","exId":"mesa-flexora","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":""},
          {"id":"academia-iniciante-C-3","exId":"flexao-de-joelho-unilateral-em-pe","series":3,"reps":"10","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":""},
          {"id":"academia-iniciante-C-4","exId":"gluteo-4-apoios-perna-90","series":3,"reps":"12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":"Pico de contração de 2 s em todas as repetições."},
          {"id":"academia-iniciante-C-5","exId":"elevacao-pelvica-no-solo-ponte","series":3,"reps":"15","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":"Com um halter na linha da cintura."},
          {"id":"academia-iniciante-C-6","exId":"panturrilha-em-pe-step-unilateral","series":3,"reps":"12 cada","carga":0,"kg":true,"bloco":"Treino","descanso":45,"obs":""}
        ]}
      ]
    },
    {
      "id":"academia-intermediaria","nome":"Academia · Intermediário","modalidade":"academia","niveis":["intermediaria"],"exemplo":false,
      "desc":"Protocolo Clube VEM intermediário: dois treinos inferiores e dois superiores.",
      "paraQuem":"Alunas de nível intermediário em musculação.","frequencia":"Musculação 4 a 5x por semana · cárdio 5 a 6x por semana","duracao":"Progressão contínua","precisa":"Academia","aquecimento":true,
      "semana":{"seg":"A","ter":"B","qua":"cardio|30–40 min","qui":"C","sex":"D","sab":"cardio|30–40 min","dom":"descanso"},
      "fases":[],"cardio":[["Frequência","5 a 6 vezes por semana"]],
      "regras":[["Ordem","Se treinar mais vezes, siga a ordem 1, 2, 3, 4, 1, 2, 3…"],["Alongamentos","Faça os alongamentos indicados antes de cada treino."]],
      "treinos":[
        {"id":"academia-intermediaria-A","letra":"A","nome":"Treino 1 · Quadríceps e glúteo","foco":"Quadríceps e glúteo","dias":["seg"],"mob":"inferior","itens":[
          {"id":"academia-intermediaria-A-a1","exId":"cadeira-extensora","series":2,"reps":"20","carga":0,"kg":true,"bloco":"Ativação","descanso":30,"obs":"Leve, só para ativar, longe da falha."},
          {"id":"academia-intermediaria-A-a2","exId":"elevacao-pelvica-unilateral","series":2,"reps":"15","carga":0,"kg":true,"bloco":"Ativação","descanso":30,"obs":""},
          {"id":"academia-intermediaria-A-1","exId":"agachamento-no-smith","series":4,"reps":"15-12-10-8","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":"Progressão de carga entre as séries."},
          {"id":"academia-intermediaria-A-2","exId":"leg-press-45","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":""},
          {"id":"academia-intermediaria-A-3","exId":"afundo-com-halter","series":3,"reps":"8-10","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":""},
          {"id":"academia-intermediaria-A-4","exId":"cadeira-extensora","series":3,"reps":"falha","carga":0,"kg":true,"bloco":"Treino","descanso":100,"obs":""},
          {"id":"academia-intermediaria-A-5","exId":"cadeira-abdutora","series":3,"reps":"10 + 10","carga":0,"kg":true,"bloco":"Rest-pause","descanso":90,"obs":"10 reps, 10 s de descanso e mais 10 reps equivalem a uma série."},
          {"id":"academia-intermediaria-A-6","exId":"panturrilha-no-banco-solear","series":4,"reps":"12-15","carga":0,"kg":true,"bloco":"Treino","descanso":45,"obs":""}
        ]},
        {"id":"academia-intermediaria-B","letra":"B","nome":"Treino 2 · Costas, ombro e bíceps","foco":"Costas, ombro e bíceps","dias":["ter"],"mob":null,"itens":[
          {"id":"academia-intermediaria-B-1","exId":"puxada-aberta-pegada-anatomica","series":4,"reps":"15-12-10-8","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":"Progressão de carga entre as séries."},
          {"id":"academia-intermediaria-B-2","exId":"puxada-alta-com-triangulo","series":3,"reps":"8-10","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-intermediaria-B-3","exId":"remada-serrote-com-halter","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":"30 s entre braços; 60 s após a série."},
          {"id":"academia-intermediaria-B-4","exId":"elevacao-lateral-com-halter","series":4,"reps":"10","carga":0,"kg":true,"bloco":"Treino","descanso":30,"obs":""},
          {"id":"academia-intermediaria-B-5","exId":"rosca-direta-barra-polia-baixa","series":4,"reps":"8-10","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":""},
          {"id":"academia-intermediaria-B-6","exId":"abdominal-infra-na-paralela","series":4,"reps":"12","carga":0,"kg":false,"bloco":"Treino","descanso":60,"obs":""}
        ]},
        {"id":"academia-intermediaria-C","letra":"C","nome":"Treino 3 · Posterior e glúteo","foco":"Posterior e glúteo","dias":["qui"],"mob":"inferior","itens":[
          {"id":"academia-intermediaria-C-a1","exId":"abducao-com-caneleira","series":2,"reps":"15","carga":0,"kg":true,"bloco":"Ativação","descanso":30,"obs":""},
          {"id":"academia-intermediaria-C-1","exId":"elevacao-pelvica-barra-ou-maquina","series":4,"reps":"15-12-10-8","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":"Progressão de carga entre as séries."},
          {"id":"academia-intermediaria-C-2","exId":"gluteo-coice-na-polia","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":"Pico de contração de 2 s. 30 s entre pernas; 60 s após a série."},
          {"id":"academia-intermediaria-C-3","exId":"cadeira-abdutora-tronco-inclinado","series":2,"reps":"12-15","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-intermediaria-C-4","exId":"mesa-flexora-rest-pause","series":3,"reps":"10 + 10","carga":0,"kg":true,"bloco":"Rest-pause","descanso":90,"obs":"10 reps, 10 s de descanso e mais 10 reps equivalem a uma série."},
          {"id":"academia-intermediaria-C-5","exId":"cadeira-flexora-unilateral","series":2,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":""},
          {"id":"academia-intermediaria-C-6","exId":"stiff-com-barra-ou-halteres","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":""}
        ]},
        {"id":"academia-intermediaria-D","letra":"D","nome":"Treino 4 · Peito, ombro e tríceps","foco":"Peito, ombro e tríceps","dias":["sex"],"mob":null,"itens":[
          {"id":"academia-intermediaria-D-1","exId":"supino-reto-maquina","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":"Usar a primeira série como aquecimento."},
          {"id":"academia-intermediaria-D-2","exId":"crucifixo-maquina","series":2,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-intermediaria-D-3","exId":"desenvolvimento-arnold","series":3,"reps":"8-10","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-intermediaria-D-4","exId":"elevacao-frontal-com-anilha","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-intermediaria-D-5","exId":"triceps-pulley-barra-reta","series":3,"reps":"8-10","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-intermediaria-D-6","exId":"triceps-frances-corda-polia","series":3,"reps":"10-13","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-intermediaria-D-7","exId":"prancha-isometrica","series":3,"reps":"falha","carga":0,"kg":false,"bloco":"Treino","descanso":45,"obs":""}
        ]}
      ]
    },
    {
      "id":"academia-avancada","nome":"Academia · Avançado","modalidade":"academia","niveis":["avancada"],"exemplo":false,
      "desc":"Protocolo Clube VEM avançado: dois treinos inferiores e dois superiores.",
      "paraQuem":"Alunas de nível avançado em musculação.","frequencia":"Musculação 5 a 6x por semana · cárdio 6 a 7x por semana","duracao":"Progressão contínua","precisa":"Academia","aquecimento":true,
      "semana":{"seg":"A","ter":"B","qua":"cardio|30–40 min","qui":"C","sex":"D","sab":"cardio|30–40 min","dom":"descanso"},
      "fases":[],"cardio":[["Frequência","Todos os dias, 6 a 7 vezes por semana"]],
      "regras":[["Ordem","Siga a ordem 1, 2, 3, 4, 1, 2, 3…"],["Alongamentos","Faça os alongamentos indicados antes de cada treino."]],
      "treinos":[
        {"id":"academia-avancada-A","letra":"A","nome":"Treino 1 · Posterior e glúteo","foco":"Posterior e glúteo com estímulo de quadríceps","dias":["seg"],"mob":"inferior","itens":[
          {"id":"academia-avancada-A-1","exId":"agachamento-sumo-com-barra","series":4,"reps":"15-12-10-8","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":"Progressão de carga entre as séries."},
          {"id":"academia-avancada-A-2","exId":"stiff-com-barra-ou-halter","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":""},
          {"id":"academia-avancada-A-3","exId":"cadeira-flexora-drop-set","series":3,"reps":"falha","carga":0,"kg":true,"bloco":"Drop-set","descanso":120,"obs":"Falha com carga para 8-12 reps; reduza 30% e vá à falha novamente, sem descanso."},
          {"id":"academia-avancada-A-4","exId":"elevacao-pelvica-unilateral","series":3,"reps":"8-10","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":"Carga alta. 30 s entre pernas; 60 s após a série."},
          {"id":"academia-avancada-A-5","exId":"extensao-de-quadril-na-polia","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":"30 s entre pernas; 60 s após a série."},
          {"id":"academia-avancada-A-6","exId":"cadeira-extensora-unilateral","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":0,"obs":"Sem intervalo; apenas o tempo da outra perna fazer a série."},
          {"id":"academia-avancada-A-7","exId":"panturrilha-no-leg-horizontal","series":4,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":""}
        ]},
        {"id":"academia-avancada-B","letra":"B","nome":"Treino 2 · Costas, bíceps e ombro","foco":"Costas, bíceps e ombro","dias":["ter"],"mob":null,"itens":[
          {"id":"academia-avancada-B-1","exId":"pull-down-com-corda","series":3,"reps":"8-12","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":""},
          {"id":"academia-avancada-B-2","exId":"puxada-supinada","series":3,"reps":"10","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-avancada-B-3","exId":"remada-baixa-com-triangulo","series":3,"reps":"8-10","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":"Pico de contração de 2 s em todas as repetições."},
          {"id":"academia-avancada-B-4","exId":"elevacao-lateral-banco-45","series":3,"reps":"12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":""},
          {"id":"academia-avancada-B-5","exId":"biset-remada-alta-rosca-direta-polia","series":3,"reps":"10 + 10","carga":0,"kg":true,"bloco":"Bi-set","descanso":90,"obs":"Sem descanso entre os dois exercícios."},
          {"id":"academia-avancada-B-6","exId":"biset-abdominal-corda-prancha-perna-elevada","series":3,"reps":"10 + 30 s cada perna","carga":0,"kg":true,"bloco":"Bi-set","descanso":90,"obs":"Sem descanso entre os dois exercícios."}
        ]},
        {"id":"academia-avancada-C","letra":"C","nome":"Treino 3 · Quadríceps e glúteo","foco":"Quadríceps e glúteo com estímulo em posterior","dias":["qui"],"mob":"inferior","itens":[
          {"id":"academia-avancada-C-1","exId":"agachamento-taca","series":4,"reps":"15-12-10-8","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":"Progressão de carga entre as séries."},
          {"id":"academia-avancada-C-2","exId":"leg-press-45-unilateral","series":3,"reps":"8-10","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":"30 s entre pernas; 90 s entre séries."},
          {"id":"academia-avancada-C-3","exId":"passada-com-halter","series":3,"reps":"12-15 cada perna","carga":0,"kg":true,"bloco":"Treino","descanso":120,"obs":""},
          {"id":"academia-avancada-C-4","exId":"coice-na-polia","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-avancada-C-5","exId":"extensao-quadril-banco-romano","series":3,"reps":"8-10","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-avancada-C-6","exId":"cadeira-adutora","series":3,"reps":"12-15","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":"Pico de contração de 2 s em todas as repetições."}
        ]},
        {"id":"academia-avancada-D","letra":"D","nome":"Treino 4 · Peito, ombro e tríceps","foco":"Peito, ombro e tríceps","dias":["sex"],"mob":null,"itens":[
          {"id":"academia-avancada-D-1","exId":"supino-inclinado-com-halter","series":3,"reps":"8-12","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-avancada-D-2","exId":"desenvolvimento-maquina","series":3,"reps":"8-12","carga":0,"kg":true,"bloco":"Treino","descanso":60,"obs":""},
          {"id":"academia-avancada-D-3","exId":"elevacao-lateral-drop-set","series":3,"reps":"falha","carga":0,"kg":true,"bloco":"Drop-set","descanso":90,"obs":"Falha com carga para 8-12 reps; reduza 30% e vá à falha novamente, sem descanso."},
          {"id":"academia-avancada-D-4","exId":"biset-face-pull-elevacao-frontal-corda","series":3,"reps":"10 + 10","carga":0,"kg":true,"bloco":"Bi-set","descanso":90,"obs":"Sem descanso entre os dois exercícios."},
          {"id":"academia-avancada-D-5","exId":"triceps-pulley-com-corda","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":""},
          {"id":"academia-avancada-D-6","exId":"triceps-testa-com-barra","series":3,"reps":"10-12","carga":0,"kg":true,"bloco":"Treino","descanso":90,"obs":"Deitada no banco."},
          {"id":"academia-avancada-D-7","exId":"abdominal-bicicleta","series":3,"reps":"30 s","carga":0,"kg":false,"bloco":"Treino","descanso":45,"obs":""}
        ]}
      ]
    }
  ]
  $json$::jsonb;
begin
  select content into current_content
  from public.content_documents
  where key = 'workouts'
  for update;

  if current_content is null then
    raise exception 'Documento editorial workouts não encontrado';
  end if;

  select coalesce(jsonb_agg(program), '[]'::jsonb)
  into retained_programs
  from jsonb_array_elements(coalesce(current_content->'programas', '[]'::jsonb)) as program
  where program->>'modalidade' <> 'academia';

  -- Mantém metadados de exercícios já existentes (animação/vídeo) quando o id coincide.
  select coalesce(jsonb_agg(existing), '[]'::jsonb) || new_exercises
  into new_exercises
  from jsonb_array_elements(coalesce(current_content->'exercicios', '[]'::jsonb)) as existing
  where not exists (
    select 1 from jsonb_array_elements(new_exercises) as replacement
    where replacement->>'id' = existing->>'id'
  );

  update public.content_documents
  set content = jsonb_set(
                  jsonb_set(current_content, '{exercicios}', new_exercises, true),
                  '{programas}', retained_programs || new_programs, true
                ) || jsonb_build_object('versao', 4),
      version = greatest(coalesce(version, 0), 4),
      schema_version = '4',
      source = 'clube-vem-training-protocols-pdf',
      published_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'trainingProtocolsImportedFrom', 'Protocolos de treino - Clube VEM.pdf',
        'trainingProtocolsImportedAt', now(),
        'gymPrograms', 3,
        'gymWorkouts', 11,
        'gymWorkoutItems', 75
      )
  where key = 'workouts';
end
$migration$;
