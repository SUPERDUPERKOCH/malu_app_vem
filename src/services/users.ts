import type { SubscriptionStatus, UserProfile, UserRole } from '../models';
import type { Database } from '../types/database';
import { supabase } from './supabase';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface RegisterUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface RegisterUserResult {
  userId: string;
  requiresEmailConfirmation: boolean;
}

export type EmailAccessFlow = 'sign_in' | 'register' | 'pending';

export async function checkEmailAccess(email: string, allowPendingRegistration = false): Promise<EmailAccessFlow> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase.functions.invoke<{ flow?: EmailAccessFlow; error?: string }>('check-access-email', {
    body: { email: normalized, allowPendingRegistration },
  });
  if (error) throw error;
  if (data?.flow === 'sign_in' || data?.flow === 'register' || data?.flow === 'pending') return data.flow;
  throw new Error(data?.error ?? 'invalid_access_check_response');
}

export interface UpdateMyProfileInput {
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  birthDate?: string | null;
  avatarUrl?: string | null;
  objective?: string | null;
  personalGoal?: string | null;
  weeklyGoal?: number | null;
  level?: 'beginner' | 'intermediate' | 'advanced' | null;
  modality?: 'gym' | 'home' | null;
  notifyWorkouts?: boolean;
  notifyMeetings?: boolean;
  notifyRewards?: boolean;
  shareProgressWithTeam?: boolean;
  onboardingCompleted?: boolean;
  mealPlanId?: string | null;
  calorieGoal?: number | null;
  mealTimes?: Record<string, string>;
}

function stringRecord(value: ProfileRow['meal_times']): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value)) if (typeof item === 'string') result[key] = item;
  return result;
}

function toUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name ?? undefined,
    role: row.role,
    subscriptionStatus: row.subscription_status,
    birthDate: row.birth_date ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    objective: row.objective ?? undefined,
    personalGoal: row.personal_goal ?? undefined,
    weeklyGoal: row.weekly_goal == null ? undefined : Math.min(4, Math.max(2, row.weekly_goal)),
    level: row.level as UserProfile['level'],
    modality: row.modality as UserProfile['modality'],
    mealPlanId: row.meal_plan_id ?? undefined,
    calorieGoal: row.calorie_goal ?? undefined,
    mealTimes: stringRecord(row.meal_times),
    notificationPreferences: {
      workouts: row.notify_workouts,
      meetings: row.notify_meetings,
      rewards: row.notify_rewards,
    },
    shareProgressWithTeam: row.share_progress_with_team,
    onboardingCompleted: row.onboarding_completed,
    active: row.active,
    legacyImportedAt: row.legacy_imported_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function registerUser(input: RegisterUserInput): Promise<RegisterUserResult> {
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) throw new Error('first_name_required');
  if (!lastName) throw new Error('last_name_required');

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
      },
    },
  });

  if (error) throw error;
  if (!data.user) throw new Error('user_not_created');
  return { userId: data.user.id, requiresEmailConfirmation: data.session === null };
}

export interface KiwifyOrderSummary {
  orderId: string;
  orderStatus: string | null;
  productName: string | null;
  subscriptionStatus: string | null;
  hasAccess: boolean;
  accessUntil: string | null;
  approvedAt: string | null;
  refundedAt: string | null;
  updatedAt: string | null;
}

export interface AccessCheck {
  role: UserRole;
  /** `false` para admin e coach, que não dependem de compra. */
  checkedKiwify: boolean;
  hasAccess: boolean;
  status: SubscriptionStatus;
  order: KiwifyOrderSummary | null;
  checkedAt: string;
}

const STATUSES: SubscriptionStatus[] = ['pending', 'active', 'suspended', 'cancelled'];

/**
 * Valida o acesso no servidor: lê a role e, se não for admin nem coach,
 * vincula e reavalia as transações da Kiwify do e-mail da conta.
 */
export async function validateMyAccess(): Promise<AccessCheck> {
  const { data, error } = await supabase.rpc('validate_my_access');
  if (error) throw error;
  const raw = (data && typeof data === 'object' && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const order = raw.order && typeof raw.order === 'object' ? raw.order as Record<string, unknown> : null;
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  const role = raw.role === 'admin' || raw.role === 'coach' ? raw.role : 'participant';
  return {
    role,
    checkedKiwify: raw.checkedKiwify === true,
    hasAccess: raw.hasAccess === true,
    status: STATUSES.includes(raw.status as SubscriptionStatus) ? raw.status as SubscriptionStatus : 'pending',
    order: order && typeof order.orderId === 'string' ? {
      orderId: order.orderId, orderStatus: text(order.orderStatus), productName: text(order.productName), subscriptionStatus: text(order.subscriptionStatus),
      hasAccess: order.hasAccess === true, accessUntil: text(order.accessUntil), approvedAt: text(order.approvedAt), refundedAt: text(order.refundedAt), updatedAt: text(order.updatedAt),
    } : null,
    checkedAt: new Date().toISOString(),
  };
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) return null;
  return getUserProfileById(authData.user.id);
}

export async function getUserProfileById(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ? toUserProfile(data) : null;
}

export async function listUserProfiles(search = '', limit = 50): Promise<UserProfile[]> {
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(Math.min(100, limit));
  const safeSearch = search.trim().replace(/[,%()]/g, '');
  if (safeSearch) {
    const pattern = `%${safeSearch}%`;
    query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data.map(toUserProfile);
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<UserProfile> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('not_authenticated');

  const update: Database['public']['Tables']['profiles']['Update'] = {
    ...(input.firstName === undefined ? {} : { first_name: input.firstName.trim() }),
    ...(input.lastName === undefined ? {} : { last_name: input.lastName.trim() }),
    ...(input.preferredName === undefined ? {} : { preferred_name: input.preferredName?.trim() || null }),
    ...(input.birthDate === undefined ? {} : { birth_date: input.birthDate }),
    ...(input.avatarUrl === undefined ? {} : { avatar_url: input.avatarUrl }),
    ...(input.objective === undefined ? {} : { objective: input.objective }),
    ...(input.personalGoal === undefined ? {} : { personal_goal: input.personalGoal }),
    ...(input.weeklyGoal === undefined ? {} : { weekly_goal: input.weeklyGoal }),
    ...(input.level === undefined ? {} : { level: input.level }),
    ...(input.modality === undefined ? {} : { modality: input.modality }),
    ...(input.notifyWorkouts === undefined ? {} : { notify_workouts: input.notifyWorkouts }),
    ...(input.notifyMeetings === undefined ? {} : { notify_meetings: input.notifyMeetings }),
    ...(input.notifyRewards === undefined ? {} : { notify_rewards: input.notifyRewards }),
    ...(input.shareProgressWithTeam === undefined ? {} : { share_progress_with_team: input.shareProgressWithTeam }),
    ...(input.onboardingCompleted === undefined ? {} : { onboarding_completed: input.onboardingCompleted }),
    ...(input.mealPlanId === undefined ? {} : { meal_plan_id: input.mealPlanId }),
    ...(input.calorieGoal === undefined ? {} : { calorie_goal: input.calorieGoal }),
    ...(input.mealTimes === undefined ? {} : { meal_times: input.mealTimes }),
  };

  const { data, error } = await supabase.from('profiles').update(update).eq('id', authData.user.id).select('*').single();
  if (error) throw error;
  return toUserProfile(data);
}
