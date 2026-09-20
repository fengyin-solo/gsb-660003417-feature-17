export interface WordNode {
  id: string; word: string; language: string; meaning: string
  family: string; era?: string; x?: number; y?: number
  /** 所属同源词组在 COGNATE_SETS 中的下标，用于筛选与选中一致性 */
  rootIndex?: number
  fx?: number; fy?: number; vx?: number; vy?: number
}
export interface WordLink {
  source: string | WordNode; target: string | WordNode
  type: 'cognate' | 'derived' | 'borrowed' | 'reconstructed'
  description?: string
  rootIndex?: number
}
export interface CognateSet {
  root: string; meaning: string
  languages: Record<string, string>
  period: string; family: string
}
export interface LanguageFamily {
  id: string; name: string; color: string; languages: string[]; era: string
}

/** 视图中保存的图谱节点引用（不依赖易变的内部 id，按 词+语言+含义 定位） */
export interface ViewNodeRef {
  word: string
  language: string
  meaning: string
}

/** 一组可恢复的筛选视图：语系 + 搜索条件 + 图谱选中节点 */
export interface FilterView {
  id: string
  name: string
  family: string
  searchQuery: string
  node: ViewNodeRef | null
  createdAt: number
  updatedAt: number
}

export type GapKind = 'family' | 'node'

export interface ViewGap {
  kind: GapKind
  message: string
}

export type ApplyStatus = 'success' | 'empty' | 'failed'

/** 单条视图（批量）恢复的逐条结果 */
export interface RestoreItemResult {
  viewId: string
  viewName: string
  status: ApplyStatus
  message: string
  gaps: ViewGap[]
  rowCount: number
}
