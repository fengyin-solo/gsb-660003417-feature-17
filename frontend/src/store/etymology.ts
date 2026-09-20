import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { COGNATE_SETS, LANGUAGE_FAMILIES, buildGraph } from '../mock/data'
import type {
  CognateSet, FilterView, ViewGap, ViewNodeRef, RestoreItemResult, WordNode
} from '../types'
export { LANGUAGE_FAMILIES, COGNATE_SETS }

const STORAGE_KEY = 'etymology.filterViews.v1'
const SEED_FLAG_KEY = 'etymology.filterViews.seeded.v1'

let uidCounter = 0
function uid(): string {
  uidCounter += 1
  return 'view_' + Date.now().toString(36) + '_' + uidCounter
}

function defaultViewName(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `视图 ${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function sanitizeView(raw: any): FilterView | null {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  const node = raw.node && typeof raw.node === 'object'
    && typeof raw.node.word === 'string'
    && typeof raw.node.language === 'string'
    && typeof raw.node.meaning === 'string'
    ? { word: raw.node.word, language: raw.node.language, meaning: raw.node.meaning }
    : null
  return {
    id: raw.id,
    name: raw.name,
    family: typeof raw.family === 'string' ? raw.family : 'all',
    searchQuery: typeof raw.searchQuery === 'string' ? raw.searchQuery : '',
    node,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

function loadViews(): FilterView[] {
  let raw: string | null = null
  try { raw = localStorage.getItem(STORAGE_KEY) } catch { raw = null }
  if (raw) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr.map(sanitizeView).filter((v): v is FilterView => v !== null)
    } catch { /* 存储损坏时退回种子数据 */ }
  }
  // 首次使用：写入两条示例，一条完好、一条含缺口，便于演示修正流程
  let seeded = false
  try { seeded = localStorage.getItem(SEED_FLAG_KEY) === '1' } catch { /* ignore */ }
  if (!seeded) {
    try { localStorage.setItem(SEED_FLAG_KEY, '1') } catch { /* ignore */ }
    return [
      {
        id: uid(), name: '示例 · 印欧水部', family: 'ie', searchQuery: '水',
        node: { word: 'aqua', language: '英语', meaning: '水' },
        createdAt: Date.now() - 2000, updatedAt: Date.now() - 2000,
      },
      {
        id: uid(), name: '示例 · 旧语系归档(有缺口)', family: 'anatolian', searchQuery: '太阳',
        node: { word: 'lumen', language: '拉丁语', meaning: '光' },
        createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000,
      },
    ]
  }
  return []
}

export const useEtymologyStore = defineStore('etymology', () => {
  const graph = ref(buildGraph())
  const selectedNode = ref<WordNode | null>(null)
  const searchQuery = ref('')
  const selectedFamily = ref('all')

  /* ---------------- 视图批次管理 ---------------- */
  const views = ref<FilterView[]>(loadViews())
  const selectedViewIds = ref<string[]>([])
  const restoreResults = ref<RestoreItemResult[] | null>(null)
  const queue = ref<FilterView[]>([])
  const queueIndex = ref(0)

  /* ---------------- 筛选与索引 ---------------- */
  const rootIndexByRoot = computed(() => {
    const m = new Map<string, number>()
    COGNATE_SETS.forEach((cs, i) => m.set(cs.root, i))
    return m
  })

  const filteredCognates = computed<CognateSet[]>(() =>
    COGNATE_SETS.filter(cs => {
      const q = searchQuery.value.trim().toLowerCase()
      const matchSearch = !q ||
        cs.root.toLowerCase().includes(q) ||
        cs.meaning.toLowerCase().includes(q) ||
        Object.values(cs.languages).some((w: string) => w.toLowerCase().includes(q))
      const matchFamily = selectedFamily.value === 'all' || cs.family === selectedFamily.value
      return matchSearch && matchFamily
    })
  )

  const filteredRootIndexes = computed(() => {
    const s = new Set<number>()
    filteredCognates.value.forEach(cs => s.add(rootIndexByRoot.value.get(cs.root)!))
    return s
  })

  const selectedRootIndex = computed(() =>
    selectedNode.value && typeof selectedNode.value.rootIndex === 'number'
      ? selectedNode.value.rootIndex
      : null
  )

  // 手动修改筛选条件时，图谱/列表/详情的选中状态与筛选结果保持一致（同步生效）
  watch([searchQuery, selectedFamily], () => {
    if (selectedNode.value && typeof selectedNode.value.rootIndex === 'number') {
      if (!filteredRootIndexes.value.has(selectedNode.value.rootIndex)) {
        selectedNode.value = null
      }
    }
  }, { flush: 'sync' })

  /* ---------------- 节点引用解析 ---------------- */
  function makeNodeRef(node: WordNode | null): ViewNodeRef | null {
    if (!node) return null
    return { word: node.word, language: node.language, meaning: node.meaning }
  }

  function resolveNodeRef(refNode: ViewNodeRef | null): WordNode | null {
    if (!refNode) return null
    const exact = graph.value.nodes.find(
      (n: WordNode) => n.word === refNode.word && n.language === refNode.language && n.meaning === refNode.meaning
    )
    return exact || null
  }

  /** 缺口修正时的候选节点：含义相同优先，含义词元有交集其次，再补同语言 */
  function nodeCandidates(refNode: ViewNodeRef): WordNode[] {
    if (!refNode) return []
    const tokens = (m: string) => new Set(m.split(/[\/\s,，、]+/).filter(Boolean))
    const want = tokens(refNode.meaning)
    const isSelf = (n: WordNode) => n.word === refNode.word && n.language === refNode.language
    const overlap = (n: WordNode) =>
      [...tokens(n.meaning)].filter(t => want.has(t)).length

    const exactMeaning: WordNode[] = []
    const related: WordNode[] = []
    const sameLang: WordNode[] = []
    for (const n of graph.value.nodes as WordNode[]) {
      if (isSelf(n)) continue
      if (n.meaning === refNode.meaning) exactMeaning.push(n)
      else if (overlap(n) > 0) related.push(n)
      else if (n.language === refNode.language) sameLang.push(n)
    }
    related.sort((a, b) => overlap(b) - overlap(a))
    return [...exactMeaning, ...related, ...sameLang].slice(0, 10)
  }

  /* ---------------- 缺口检查 ---------------- */
  function familyNameOf(familyId: string): string {
    if (familyId === 'all') return '全部语系'
    return LANGUAGE_FAMILIES.find(f => f.id === familyId)?.name || familyId
  }

  function evaluateGaps(view: FilterView): ViewGap[] {
    const gaps: ViewGap[] = []
    if (view.family !== 'all' && !LANGUAGE_FAMILIES.some(f => f.id === view.family)) {
      gaps.push({ kind: 'family', message: `语系 “${view.family}” 已不存在` })
    }
    if (view.node && !resolveNodeRef(view.node)) {
      gaps.push({
        kind: 'node',
        message: `词条 “${view.node.word}”（${view.node.language}，含义：${view.node.meaning}）已不存在`,
      })
    }
    return gaps
  }

  function gapsMap(): Record<string, ViewGap[]> {
    const m: Record<string, ViewGap[]> = {}
    views.value.forEach(v => { const g = evaluateGaps(v); if (g.length) m[v.id] = g })
    return m
  }

  function rowsFor(family: string, query: string): { count: number; rootIndexes: Set<number> } {
    const q = query.trim().toLowerCase()
    const rootIndexes = new Set<number>()
    const rows = COGNATE_SETS.filter((cs, i) => {
      const matchFamily = family === 'all' || cs.family === family
      const matchSearch = !q ||
        cs.root.toLowerCase().includes(q) ||
        cs.meaning.toLowerCase().includes(q) ||
        Object.values(cs.languages).some((w: string) => w.toLowerCase().includes(q))
      if (matchFamily && matchSearch) rootIndexes.add(i)
      return matchFamily && matchSearch
    })
    return { count: rows.length, rootIndexes }
  }

  /* ---------------- 视图恢复（纯评估 + 实际应用） ---------------- */
  function evaluateView(view: FilterView): RestoreItemResult {
    const gaps = evaluateGaps(view)
    const { count: rowCount, rootIndexes } = rowsFor(view.family, view.searchQuery)
    if (gaps.length) {
      return {
        viewId: view.id, viewName: view.name, status: 'failed', rowCount,
        gaps,
        message: `存在 ${gaps.length} 处缺口，未恢复；请修正后重试`,
      }
    }
    const resolved = resolveNodeRef(view.node)
    const nodeVisible = resolved && typeof resolved.rootIndex === 'number'
      ? rootIndexes.has(resolved.rootIndex)
      : false
    if (!rowCount) {
      return {
        viewId: view.id, viewName: view.name, status: 'empty', rowCount, gaps: [],
        message: '筛选条件有效，但当前没有匹配的词条（已应用筛选，图谱选中同步清空）',
      }
    }
    return {
      viewId: view.id, viewName: view.name, status: 'success', rowCount, gaps: [],
      message: view.node
        ? (nodeVisible ? '已恢复筛选与图谱选择' : '已恢复筛选；保存的节点不在筛选结果中，选中已清除')
        : '已恢复筛选条件',
    }
  }

  function applyView(view: FilterView) {
    selectedFamily.value = view.family
    searchQuery.value = view.searchQuery
    const resolved = resolveNodeRef(view.node)
    const visible = resolved && typeof resolved.rootIndex === 'number'
      ? filteredRootIndexes.value.has(resolved.rootIndex)
      : false
    selectedNode.value = visible ? resolved : null
  }

  function restoreView(view: FilterView): RestoreItemResult {
    const result = evaluateView(view)
    if (result.status !== 'failed') applyView(view)
    restoreResults.value = [result]
    queue.value = []
    return result
  }

  /* ---------------- 批量恢复：多选一次恢复，逐条切换 ---------------- */
  function batchRestore(): RestoreItemResult[] {
    const picked = views.value.filter(v => selectedViewIds.value.includes(v.id))
    const results = picked.map(evaluateView)
    restoreResults.value = results
    const restorable = picked.filter(v =>
      !results.find(r => r.viewId === v.id && r.status === 'failed')
    )
    queue.value = restorable
    queueIndex.value = 0
    if (restorable.length) applyView(restorable[0])
    return results
  }

  function gotoQueue(offset: number) {
    if (!queue.value.length) return
    const next = Math.min(queue.value.length - 1, Math.max(0, queueIndex.value + offset))
    queueIndex.value = next
    applyView(queue.value[next])
  }

  function exitQueue() {
    queue.value = []
    queueIndex.value = 0
  }

  function clearResults() {
    restoreResults.value = null
  }

  /* ---------------- 视图增删改 ---------------- */
  function saveCurrentView(name?: string) {
    const view: FilterView = {
      id: uid(),
      name: name?.trim() || defaultViewName(),
      family: selectedFamily.value,
      searchQuery: searchQuery.value,
      node: makeNodeRef(selectedNode.value),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    views.value.push(view)
    selectedViewIds.value.push(view.id)
    return view
  }

  function deleteViews(ids: string[]) {
    const set = new Set(ids)
    views.value = views.value.filter(v => !set.has(v.id))
    selectedViewIds.value = selectedViewIds.value.filter(id => !set.has(id))
    if (queue.value.length) {
      const remaining = queue.value.filter(v => !set.has(v.id))
      queue.value = remaining
      if (!remaining.length) {
        queueIndex.value = 0
      } else {
        queueIndex.value = Math.min(queueIndex.value, remaining.length - 1)
        applyView(remaining[queueIndex.value])
      }
    }
  }

  function fixViewFamily(viewId: string, family: string) {
    const v = views.value.find(x => x.id === viewId)
    if (!v) return
    v.family = family
    v.updatedAt = Date.now()
  }

  function fixViewNode(viewId: string, nodeId: string) {
    const v = views.value.find(x => x.id === viewId)
    if (!v || nodeId === '__invalid__') return
    if (!nodeId) {
      v.node = null
    } else {
      const target = graph.value.nodes.find((n: WordNode) => n.id === nodeId)
      if (target) v.node = makeNodeRef(target)
    }
    v.updatedAt = Date.now()
  }

  function renameView(viewId: string, name: string) {
    const v = views.value.find(x => x.id === viewId)
    if (v && name.trim()) {
      v.name = name.trim()
      v.updatedAt = Date.now()
    }
  }

  function toggleViewSelection(id: string) {
    const i = selectedViewIds.value.indexOf(id)
    if (i >= 0) selectedViewIds.value.splice(i, 1)
    else selectedViewIds.value.push(id)
  }

  function selectAllViews() {
    selectedViewIds.value = views.value.map(v => v.id)
  }

  function clearViewSelection() {
    selectedViewIds.value = []
  }

  function selectRow(rootIndex: number) {
    if (!filteredRootIndexes.value.has(rootIndex)) return
    selectedNode.value = graph.value.nodes.find(
      (n: WordNode) => n.language === 'Proto-IE' && n.rootIndex === rootIndex
    ) || null
  }

  /* ---------------- 持久化 ---------------- */
  watch(views, (val) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(val)) } catch { /* ignore */ }
  }, { deep: true })

  return {
    graph, selectedNode, searchQuery, selectedFamily, filteredCognates,
    filteredRootIndexes, selectedRootIndex,
    views, selectedViewIds, restoreResults, queue, queueIndex,
    saveCurrentView, deleteViews, renameView, fixViewFamily, fixViewNode,
    toggleViewSelection, selectAllViews, clearViewSelection,
    evaluateView, evaluateGaps, gapsMap, nodeCandidates, resolveNodeRef,
    restoreView, batchRestore, gotoQueue, exitQueue, clearResults,
    selectRow, familyNameOf,
  }
})
