import { CATEGORIES, CATEGORY_IDS, isCategoryId, type CategoryId } from './catalog';

// API のレスポンス形式のバージョン。互換性のない変更をしたら上げ、クライアントで判定する。
export const SCHEMA_VERSION = 1;

export type Confidence = 'high' | 'medium' | 'low';

export interface Guess {
  value: string; // 推定できなければ空文字
  confidence: Confidence;
  candidates: string[]; // value 以外の候補（多い順）
}

export interface IdentifyResult {
  isGear: boolean;
  category: Guess;
  type: Guess;
  brand: Guess;
  model: Guess;
  modelNumber: Guess;
  color: Guess;
  features: string[];
  evidence: string;
}

const CONFIDENCE = ['high', 'medium', 'low'] as const;

const guess = (description: string, values?: readonly string[]) => ({
  type: 'object',
  description,
  additionalProperties: false,
  required: ['value', 'confidence', 'candidates'],
  properties: {
    value: values ? { type: 'string', enum: [...values, ''] } : { type: 'string' },
    confidence: { type: 'string', enum: CONFIDENCE },
    candidates: { type: 'array', items: { type: 'string' } },
  },
});

// Claude の構造化出力（output_config.format）に渡す JSON Schema
export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isGear', 'category', 'type', 'brand', 'model', 'modelNumber', 'color', 'features', 'evidence'],
  properties: {
    isGear: { type: 'boolean', description: '写真の主題がギター・アンプ・キャビネット・エフェクターのいずれかか' },
    category: guess('機材のカテゴリ', CATEGORY_IDS),
    type: guess('種類。カテゴリごとの選択肢から選ぶ'),
    brand: guess('メーカー名（ロゴ表記どおりの英字表記）'),
    model: guess('モデル名・シリーズ名'),
    modelNumber: guess('型番（例: TS9, JCM800 2203, ST62-US）'),
    color: guess('色・仕上げ（日本語）'),
    features: { type: 'array', items: { type: 'string' }, description: '見た目から分かる特徴（日本語の短いフレーズ）' },
    evidence: { type: 'string', description: '判定の根拠（見えたロゴ・文字・形状など）を日本語で1〜2文' },
  },
} as const;

const MAX_TEXT = 80;
const MAX_CANDIDATES = 3;
const MAX_FEATURES = 6;

const clean = (v: unknown, max = MAX_TEXT): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function normalizeGuess(raw: unknown): Guess {
  const g = (raw ?? {}) as Record<string, unknown>;
  const value = clean(g.value);
  const confidence = CONFIDENCE.includes(g.confidence as Confidence) ? (g.confidence as Confidence) : 'low';
  const candidates = Array.isArray(g.candidates)
    ? [...new Set(g.candidates.map(c => clean(c)).filter(c => c && c !== value))].slice(0, MAX_CANDIDATES)
    : [];
  return { value, confidence: value ? confidence : 'low', candidates };
}

// モデル出力は信頼せず、型・長さ・選択肢をサーバー側で必ず検証してからクライアントに返す
export function normalizeResult(raw: unknown): IdentifyResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const category = normalizeGuess(r.category);
  if (category.value && !isCategoryId(category.value)) {
    category.value = '';
    category.confidence = 'low';
  }
  category.candidates = category.candidates.filter(isCategoryId);

  const type = normalizeGuess(r.type);
  if (category.value) {
    const allowed: readonly string[] = CATEGORIES[category.value as CategoryId].types;
    if (type.value && !allowed.includes(type.value)) {
      type.candidates = [type.value, ...type.candidates].slice(0, MAX_CANDIDATES);
      type.value = '';
      type.confidence = 'low';
    }
    type.candidates = type.candidates.filter(c => allowed.includes(c));
  }

  return {
    isGear: r.isGear === true,
    category,
    type,
    brand: normalizeGuess(r.brand),
    model: normalizeGuess(r.model),
    modelNumber: normalizeGuess(r.modelNumber),
    color: normalizeGuess(r.color),
    features: Array.isArray(r.features) ? r.features.map(f => clean(f, 40)).filter(Boolean).slice(0, MAX_FEATURES) : [],
    evidence: clean(r.evidence, 200),
  };
}
