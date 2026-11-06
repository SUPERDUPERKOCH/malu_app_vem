-- Conteúdo administrativo inicial extraído da versão anterior.
insert into public.content_documents (key, content, active) values
  ('general', $content${"aviso":{"id":"a1","texto":"Bem-vinda à VEM! Confira no Painel se seu nível e sua modalidade estão certos.","exemplo":true},"metaSemanalPadrao":3,"frases":[],"corrida":[{"id":"c1","titulo":"Do zero aos 5 km","descricao":"8 semanas, 3 treinos por semana, alternando caminhada e corrida leve.","pdf":"","exemplo":true,"semanas":[{"id":"c1s1","liberaEm":"2026-11-02","titulo":"Semanas 1 e 2","texto":"5 min de caminhada. Depois 8 vezes: 1 min correndo + 1min30 caminhando."},{"id":"c1s2","liberaEm":"2026-11-16","titulo":"Semanas 3 e 4","texto":"5 min de caminhada. Depois 6 vezes: 2 min correndo + 1 min caminhando."},{"id":"c1s3","liberaEm":"2026-11-30","titulo":"Semanas 5 e 6","texto":"5 min de caminhada. Depois 3 vezes: 5 min correndo + 2 min caminhando."},{"id":"c1s4","liberaEm":"2026-12-14","titulo":"Semanas 7 e 8","texto":"5 min de caminhada. Corra 20 a 30 min no seu ritmo. Na última sessão, os 5 km."}]}],"alimentacao":[{"id":"n1","titulo":"Como montar um prato que sustenta","texto":"Metade do prato com legumes e verduras, um quarto com proteína e um quarto com carboidrato. Sem proibir nada.","pdf":"","pdfNome":"","exemplo":true},{"id":"n2","titulo":"Lanches práticos pra levar na bolsa","texto":"Fruta com castanhas, iogurte, ovo cozido, sanduíche simples. Ter opção à mão evita chegar faminta em casa.","pdf":"","pdfNome":"","exemplo":true}]}$content$::jsonb, true),
  ('vem_settings', $content${"call":null}$content$::jsonb, true)
on conflict (key) do update set content = excluded.content, active = excluded.active, updated_at = now();

insert into public.meetings (id, meeting_date, meeting_time, topic, responsible, join_url, recording_url, active) values
  ('g1', '2026-11-09', '20:00', 'Boas-vindas e intenções para a jornada', 'Malu', null, null, true),
  ('g2', '2026-11-16', '20:00', 'Fome física e fome emocional', 'Malu', null, null, true),
  ('g3', '2026-11-23', '20:00', 'Ansiedade e comida', 'Psicóloga convidada', null, null, true),
  ('g4', '2026-11-30', '20:00', 'Autoestima em movimento', 'Malu', null, null, true)
on conflict (id) do update set meeting_date = excluded.meeting_date, meeting_time = excluded.meeting_time, topic = excluded.topic, responsible = excluded.responsible, join_url = excluded.join_url, recording_url = excluded.recording_url, active = excluded.active, updated_at = now();

insert into public.rewards (id, name, description, metric, target, sort_order, active) values
  ('pr1', 'Café sozinha num lugar especial', 'Meia hora só sua, com o café que você mais gosta.', 'workouts', 3, 1, true),
  ('pr2', 'Fazer a unha', 'Escolha a cor que combina com essa nova fase.', 'workouts', 7, 2, true),
  ('pr3', 'Massagem', 'Seu corpo trabalhou. Agora ele merece descansar.', 'workouts', 15, 3, true),
  ('pr4', 'Comprar algo pequeno pra você', 'Um mimo para celebrar sua conquista.', 'workouts', 22, 4, true),
  ('pr5', 'Cuidar do cabelo', 'Corte, hidratação ou aquele cuidado que você adiou.', 'workouts', 30, 5, true),
  ('pr6', 'Tarde de autocuidado', 'Livro, banho demorado ou série favorita. Sem culpa.', 'streak', 7, 6, true),
  ('pr7', 'Dia de spa', 'Você chegou longe. Celebre do jeito que merece.', 'workouts', 60, 7, true)
on conflict (id) do update set name = excluded.name, description = excluded.description, metric = excluded.metric, target = excluded.target, sort_order = excluded.sort_order, active = excluded.active, updated_at = now();
