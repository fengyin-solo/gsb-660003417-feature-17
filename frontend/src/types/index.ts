export interface WordNode {
  id: string; word: string; language: string; meaning: string
  family: string; era?: string; x?: number; y?: number
  /** 所属同源词组（词根），用于按筛选结果裁剪图谱 */
  setRoot?: string
}
export interface WordLink {
  source: string; target: string
  type: 'cognate' | 'derived' | 'borrowed' | 'reconstructed'
  description?: string
}
export interface CognateSet {
  root: string; meaning: string
  languages: Record<string, string>
  period: string; family: string
}
export interface LanguageFamily {
  id: string; name: string; color: string; languages: string[]; era: string
}

/** 一组可保存、可批量恢复的筛选视图 */
export interface FilterView {
  id: string
  name: string
  familyId: string
  search: string
  /** 保存时图谱中选中的节点 ID；null 表示未选中 */
  selectedNodeId: string | null
  createdAt: number
  updatedAt: number
}

/** 视图保存的引用在当前数据中已失效的部分 */
export interface ViewGap {
  missingFamily: boolean
  missingNode: boolean
}

export type RestoreStatus = 'restored' | 'restored-empty' | 'failed'

/** 单条视图恢复结果 */
export interface RestoreResult {
  viewId: string
  viewName: string
  status: RestoreStatus
  /** status=restored 时，保存的选中节点被过滤结果剔除的提示 */
  droppedSelection?: boolean
  message: string
}
