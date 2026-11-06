import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { CourseContentDocument, GeneralContentDocument } from '../models/content';
import type { Json } from '../types/database';
import { supabase } from './supabase';

export interface Meeting {
  id: string;
  date: string;
  time: string;
  durationMinutes: number;
  topic: string;
  responsible: string;
  type: 'weekly' | 'specialist';
  joinUrl: string;
  recordingUrl: string;
  materials: string;
}
export interface CallInfo { link: string; title: string; info: string }
export interface AgendaEvent { id: string; date: string; time: string; title: string; place: string }
export interface Lesson { id: string; title: string; duration: string; videoUrl: string; pdfUrl: string; pdfName: string; activity: string; completedAt: string | null }
export interface CourseModule { id: string; title: string; description: string; example: boolean; lessons: Lesson[] }
export interface Course { title: string; subtitle: string; modules: CourseModule[]; completed: number; total: number }
export interface Material { id: string; title: string; text: string; url: string; urlName: string; example: boolean; source: 'material' | 'encontro' }
export interface CommunityData { call: CallInfo | null; upcoming: Meeting[]; past: Meeting[]; events: AgendaEvent[]; course: Course; materials: Material[] }

export function dateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export const isLink = (value: string | undefined | null): value is string => !!value && /^https?:\/\//i.test(value.trim());

async function currentUserId(): Promise<string> { const { data, error } = await supabase.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('not_authenticated'); return data.user.id; }
function objectValue(value: Json | undefined): Record<string, Json | undefined> { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
const text = (value: Json | undefined): string => (typeof value === 'string' ? value.trim() : '');

export async function loadCommunity(): Promise<CommunityData> {
  const userId = await currentUserId();
  const today = dateKey();
  const [meetingsResult, settingsResult, agendaResult, courseResult, generalResult, progressResult] = await Promise.all([
    supabase.from('meetings').select('*').eq('active', true).order('meeting_date').order('meeting_time'),
    supabase.from('content_documents').select('content').eq('key', 'vem_settings').maybeSingle(),
    supabase.from('content_documents').select('content').eq('key', 'agenda').maybeSingle(),
    supabase.from('content_documents').select('content').eq('key', 'course').maybeSingle(),
    supabase.from('content_documents').select('content').eq('key', 'general').maybeSingle(),
    supabase.from('course_lesson_progress').select('module_id, lesson_id, completed_at').eq('user_id', userId),
  ]);
  for (const result of [meetingsResult, settingsResult, agendaResult, courseResult, generalResult, progressResult]) if (result.error) throw result.error;

  const meetings: Meeting[] = (meetingsResult.data ?? []).map((row) => ({
    id: row.id, date: row.meeting_date, time: row.meeting_time?.slice(0, 5) ?? '', durationMinutes: row.duration_minutes, topic: row.topic, responsible: row.responsible ?? '',
    type: row.meeting_type === 'specialist' ? 'specialist' : 'weekly', joinUrl: row.join_url ?? '', recordingUrl: row.recording_url ?? '', materials: row.materials_url ?? '',
  }));
  const call = objectValue(objectValue(settingsResult.data?.content).call);
  const events = (Array.isArray(objectValue(agendaResult.data?.content).eventos) ? objectValue(agendaResult.data?.content).eventos as Json[] : []).flatMap((item) => {
    const raw = objectValue(item);
    const date = text(raw.data);
    return date && date >= today && text(raw.titulo) ? [{ id: text(raw.id) || `${date}-${text(raw.titulo)}`, date, time: text(raw.hora), title: text(raw.titulo), place: text(raw.local) }] : [];
  }).sort((a, b) => (a.date < b.date ? -1 : 1));

  const progress = new Map((progressResult.data ?? []).map((row) => [`${row.module_id}/${row.lesson_id}`, row.completed_at]));
  const courseDoc = (courseResult.data?.content ?? {}) as unknown as Partial<CourseContentDocument>;
  const modules: CourseModule[] = (courseDoc.modulos ?? []).map((module) => ({
    id: module.id, title: module.titulo, description: module.descricao ?? '', example: !!module.exemplo,
    lessons: (module.aulas ?? []).map((lesson) => ({
      id: lesson.id, title: lesson.titulo, duration: lesson.duracao ?? '',
      videoUrl: isLink(lesson.videoLink) ? lesson.videoLink.trim() : isLink(lesson.video) ? lesson.video.trim() : '',
      pdfUrl: isLink(lesson.pdf) ? lesson.pdf.trim() : '', pdfName: lesson.pdfNome ?? '', activity: lesson.atividade ?? '',
      completedAt: progress.get(`${module.id}/${lesson.id}`) ?? null,
    })),
  }));
  const lessons = modules.flatMap((module) => module.lessons);

  const general = (generalResult.data?.content ?? {}) as unknown as GeneralContentDocument;
  const materials: Material[] = [
    ...(general.alimentacao ?? []).map((item) => ({ id: item.id, title: item.titulo, text: item.texto, url: isLink(item.pdf) ? item.pdf.trim() : '', urlName: item.pdfNome ?? '', example: !!item.exemplo, source: 'material' as const })),
    ...meetings.filter((meeting) => meeting.date < today && meeting.materials).reverse().map((meeting) => ({
      id: `m-${meeting.id}`, title: meeting.topic, text: isLink(meeting.materials) ? '' : meeting.materials, url: isLink(meeting.materials) ? meeting.materials.trim() : '', urlName: '', example: false, source: 'encontro' as const,
    })),
  ];

  return {
    call: isLink(text(call.link)) ? { link: text(call.link), title: text(call.titulo) || 'Call da VEM', info: text(call.info) } : null,
    upcoming: meetings.filter((meeting) => meeting.date >= today),
    past: meetings.filter((meeting) => meeting.date < today).reverse(),
    events,
    course: { title: courseDoc.titulo ?? 'Curso Vida em Movimento', subtitle: courseDoc.subtitulo ?? '', modules, completed: lessons.filter((lesson) => lesson.completedAt).length, total: lessons.length },
    materials,
  };
}

export async function setLessonCompleted(moduleId: string, lessonId: string, done: boolean): Promise<void> {
  const userId = await currentUserId();
  const result = await supabase.from('course_lesson_progress').upsert({ user_id: userId, module_id: moduleId, lesson_id: lessonId, completed_at: done ? new Date().toISOString() : null }, { onConflict: 'user_id,module_id,lesson_id' });
  if (result.error) throw result.error;
}

function meetingRange(meeting: Pick<Meeting, 'date' | 'time' | 'durationMinutes'>): [Date, Date] {
  const [y, m, d] = meeting.date.split('-').map(Number);
  const [hh, mi] = (meeting.time || '20:00').split(':').map(Number);
  const start = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, hh ?? 20, mi ?? 0);
  return [start, new Date(start.getTime() + (meeting.durationMinutes || 60) * 60000)];
}
const utcStamp = (date: Date): string => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Link do Google Agenda com o encontro já preenchido. */
export function googleCalendarUrl(meeting: Meeting, fallbackLink = ''): string {
  const [start, end] = meetingRange(meeting);
  const link = meeting.joinUrl || fallbackLink;
  const details = [meeting.responsible ? `Com ${meeting.responsible}.` : '', link ? `Link: ${link}` : ''].filter(Boolean).join(' ');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Encontro VEM: ${meeting.topic}`)}&dates=${utcStamp(start)}/${utcStamp(end)}&details=${encodeURIComponent(details)}&ctz=America/Sao_Paulo`;
}

/** Gera o convite .ics e abre o compartilhamento (abre direto no app de calendário do celular). */
export async function shareMeetingInvite(meeting: Meeting, fallbackLink = ''): Promise<void> {
  const [start, end] = meetingRange(meeting);
  const clean = (value: string): string => value.replace(/\r?\n/g, ' ').replace(/([,;])/g, '\\$1');
  const link = meeting.joinUrl || fallbackLink;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VEM//App//PT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${meeting.id}@vem`, `DTSTAMP:${utcStamp(new Date())}`, `DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`,
    `SUMMARY:${clean(`Encontro VEM: ${meeting.topic}`)}`,
    `DESCRIPTION:${clean([meeting.responsible ? `Com ${meeting.responsible}.` : '', link ? `Link: ${link}` : ''].filter(Boolean).join(' '))}`,
    ...(link ? [`URL:${link}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Encontro VEM em 30 minutos', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const file = new File(Paths.cache, `encontro-vem-${meeting.date}.ics`);
  if (file.exists) file.delete();
  await file.write(ics);
  if (!(await Sharing.isAvailableAsync())) throw new Error('O compartilhamento não está disponível neste aparelho.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', dialogTitle: 'Adicionar ao calendário', UTI: 'com.apple.ical.ics' });
}
