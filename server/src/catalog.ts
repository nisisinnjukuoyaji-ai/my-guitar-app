// フロントエンド（app.js の CATEGORIES）と同じ分類。変更するときは両方そろえること。
export const CATEGORIES = {
  guitar: { label: 'ギター', types: ['エレキギター', 'アコースティックギター', 'エレアコ', 'クラシックギター', 'ベース', 'その他'] },
  amp: { label: 'アンプ', types: ['ヘッド', 'コンボ', 'モデリング', 'プリアンプ', 'パワーアンプ', 'その他'] },
  cabinet: { label: 'キャビネット', types: ['1x12', '2x12', '4x12', '1x10', '2x10', '4x10', '1x15', 'その他'] },
  effect: { label: 'エフェクター', types: ['オーバードライブ', 'ディストーション', 'ファズ', 'ブースター', 'コンプレッサー', 'ディレイ', 'リバーブ', 'モジュレーション', 'ワウ/フィルター', 'ピッチ', 'EQ', 'ノイズゲート', 'チューナー', 'マルチエフェクター', 'その他'] },
} as const;

export type CategoryId = keyof typeof CATEGORIES;

export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

export function isCategoryId(value: string): value is CategoryId {
  return Object.hasOwn(CATEGORIES, value);
}
