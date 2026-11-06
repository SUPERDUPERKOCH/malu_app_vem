export interface ContentProfessional {
  nome: string;
  cref?: string;
  crn?: string;
}

export interface MobilityItem {
  exId: string;
  qtd: string;
  como: string;
}

export interface WorkoutExerciseContent {
  id: string;
  nome: string;
  grupo: string;
  anim?: string;
  dicas?: string;
  erros?: string;
  alternativa?: string;
  video?: string;
  videoLink?: string;
}

export interface WorkoutItemContent {
  id: string;
  exId: string;
  series: number;
  reps: string;
  carga?: number;
  descanso: number;
  obs?: string;
  bloco?: 'Principal' | 'Acessórios' | 'Abdômen' | 'Cardio' | string;
  kg?: boolean;
}

export interface WorkoutContent {
  id: string;
  letra?: string;
  nome: string;
  foco: string;
  dias: string[];
  mob?: string | null;
  itens: WorkoutItemContent[];
}

export interface WorkoutProgramContent {
  id: string;
  nome: string;
  modalidade: string;
  niveis: string[];
  inicio?: string;
  treinos: WorkoutContent[];
  desc?: string;
  paraQuem?: string;
  frequencia?: string;
  duracao?: string;
  precisa?: string;
  semana?: Record<string, string>;
  fases?: string[][];
  cardio?: string[][];
  regras?: string[][];
  exemplo?: boolean;
}

export interface WorkoutsContentDocument {
  versao: number;
  responsavel: ContentProfessional;
  mobilidade: Record<string, MobilityItem[]>;
  exercicios: WorkoutExerciseContent[];
  programas: WorkoutProgramContent[];
}

export interface CourseLessonContent {
  id: string;
  titulo: string;
  duracao?: string;
  video?: string;
  videoLink?: string;
  pdf?: string;
  pdfNome?: string;
  atividade?: string;
}

export interface CourseModuleContent {
  id: string;
  titulo: string;
  descricao?: string;
  exemplo?: boolean;
  aulas: CourseLessonContent[];
}

export interface CourseContentDocument {
  titulo: string;
  subtitulo?: string;
  modulos: CourseModuleContent[];
}

export interface RunningWeekContent {
  id: string;
  liberaEm?: string;
  titulo: string;
  texto: string;
}

export interface RunningPlanContent {
  id: string;
  titulo: string;
  descricao?: string;
  pdf?: string;
  exemplo?: boolean;
  semanas: RunningWeekContent[];
}

export interface GeneralContentDocument {
  aviso?: { id: string; texto: string; exemplo?: boolean };
  metaSemanalPadrao?: number;
  frases?: Array<{ id: string; texto: string; data?: string }>;
  corrida?: RunningPlanContent[];
  alimentacao?: Array<{ id: string; titulo: string; texto: string; pdf?: string; pdfNome?: string; exemplo?: boolean }>;
  lembretes?: TeamReminderContent[];
}

/** Lembrete criado pela equipe para todas as participantes (tipo: agua, leitura, tarefa, treino, autocuidado, outro). */
export interface TeamReminderContent {
  id: string;
  titulo: string;
  tipo: string;
  hora?: string;
  dias?: string[];
  nota?: string;
}

export interface MealPlansContentDocument {
  responsavel?: ContentProfessional;
  lista: Array<{ id: string; kcal: number; tipo: string; intro?: string; [key: string]: unknown }>;
}
