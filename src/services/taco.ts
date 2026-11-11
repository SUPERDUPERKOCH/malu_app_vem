import AsyncStorage from '@react-native-async-storage/async-storage';

const TACO_BASE_URL = 'https://brolesi.github.io/taco';
const INDEX_CACHE_KEY = '@vem/taco/index-v1';
const DETAIL_CACHE_PREFIX = '@vem/taco/food-v1/';
const INDEX_TTL = 7 * 24 * 60 * 60 * 1000;
const DETAIL_TTL = 90 * 24 * 60 * 60 * 1000;

export interface TacoFoodSummary {
  id: number;
  description: string;
}

export interface TacoFoodEnergy {
  description: string;
  energyKcal: number;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

let indexMemory: TacoFoodSummary[] | null = null;
let indexRequest: Promise<TacoFoodSummary[]> | null = null;
const detailMemory = new Map<number, TacoFoodEnergy>();
const detailRequests = new Map<number, Promise<TacoFoodEnergy>>();

function parseCache<T>(raw: string | null): CacheEntry<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CacheEntry<T>>;
    return typeof parsed.expiresAt === 'number' && parsed.value !== undefined
      ? parsed as CacheEntry<T>
      : null;
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`taco_http_${response.status}`);
  return response.json() as Promise<unknown>;
}

function parseIndex(payload: unknown): TacoFoodSummary[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('taco_invalid_index');
  const foods = (payload as { foods?: unknown }).foods;
  if (!Array.isArray(foods)) throw new Error('taco_invalid_index');
  const parsed = foods.flatMap((food): TacoFoodSummary[] => {
    if (!food || typeof food !== 'object' || Array.isArray(food)) return [];
    const { id, description } = food as { id?: unknown; description?: unknown };
    return typeof id === 'number' && Number.isInteger(id) && typeof description === 'string' && description.trim()
      ? [{ id, description: description.trim() }]
      : [];
  });
  if (!parsed.length) throw new Error('taco_empty_index');
  return parsed;
}

function parseEnergy(payload: unknown): TacoFoodEnergy {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('taco_invalid_food');
  const { description, energy_kcal: energyKcal } = payload as { description?: unknown; energy_kcal?: unknown };
  if (typeof description !== 'string' || typeof energyKcal !== 'number' || !Number.isFinite(energyKcal)) {
    throw new Error('taco_energy_unavailable');
  }
  // Somente estes dois campos seguem para o app e para o cache.
  return { description: description.trim(), energyKcal };
}

export async function getTacoFoods(): Promise<TacoFoodSummary[]> {
  if (indexMemory) return indexMemory;
  if (indexRequest) return indexRequest;

  indexRequest = (async () => {
    const cached = parseCache<TacoFoodSummary[]>(await AsyncStorage.getItem(INDEX_CACHE_KEY));
    if (cached?.value.length && cached.expiresAt > Date.now()) {
      indexMemory = cached.value;
      return cached.value;
    }

    try {
      const foods = parseIndex(await fetchJson(`${TACO_BASE_URL}/foods.json`));
      indexMemory = foods;
      await AsyncStorage.setItem(INDEX_CACHE_KEY, JSON.stringify({ expiresAt: Date.now() + INDEX_TTL, value: foods } satisfies CacheEntry<TacoFoodSummary[]>));
      return foods;
    } catch (error) {
      if (cached?.value.length) {
        indexMemory = cached.value;
        return cached.value;
      }
      throw error;
    }
  })().finally(() => { indexRequest = null; });

  return indexRequest;
}

export async function getTacoFoodEnergy(id: number): Promise<TacoFoodEnergy> {
  const memory = detailMemory.get(id);
  if (memory) return memory;
  const pending = detailRequests.get(id);
  if (pending) return pending;

  const request = (async () => {
    const cacheKey = `${DETAIL_CACHE_PREFIX}${id}`;
    const cached = parseCache<TacoFoodEnergy>(await AsyncStorage.getItem(cacheKey));
    if (cached && cached.expiresAt > Date.now()) {
      detailMemory.set(id, cached.value);
      return cached.value;
    }

    try {
      const food = parseEnergy(await fetchJson(`${TACO_BASE_URL}/foods/${id}.json`));
      detailMemory.set(id, food);
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ expiresAt: Date.now() + DETAIL_TTL, value: food } satisfies CacheEntry<TacoFoodEnergy>));
      return food;
    } catch (error) {
      if (cached) {
        detailMemory.set(id, cached.value);
        return cached.value;
      }
      throw error;
    }
  })().finally(() => { detailRequests.delete(id); });

  detailRequests.set(id, request);
  return request;
}
