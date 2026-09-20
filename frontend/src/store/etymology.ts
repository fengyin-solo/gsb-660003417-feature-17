import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { COGNATE_SETS, LANGUAGE_FAMILIES, buildGraph } from '../mock/data'
import type { FilterView, RestoreResult, ViewGap, WordNode } from '../types'
export { LANGUAGE_FAMILIES, COGNATE_SETS }

const STORAGE_KEY = 'etymology-filter-views-v1'

function loadViews(): FilterView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.views) ? parsed.views : []
  } catch {
    return []
  }
}

/** 给节点生成人类可读的标签，用于视图列表与修正下拉 */
export function nodeLabel(node: WordNode | undefined | null): string {
  if (!node) return '无'
  if (node.language === 'Proto-IE') return `词根 ${node.word}`
  return `${node.language}「${node.word}」(${node.meaning})`
}

export const useEtymologyStore = defineStore('etymology', () => {
  const graph = ref(buildGraph())
  const selectedNodeId = ref<string | null>(null)
  const searchQuery = ref('')
  const selectedFamily = ref('all')

  // ---------- 筛选视图 ----------
  const views = ref<FilterView[]>(loadViews())

  // ---------- 批量恢复会话（临时态，不持久化） ----------
  const restoreActive = ref(false)
  const restoreQueue = ref<FilterView[]>([])
  const restoreIndex = ref(0)
  const restoreResults = ref<RestoreResult[]>([])

  watch(views, (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, views: v }))
    } catch {
      // localStorage 不可用时仅在内存中保留
    }
  }, { deep: true, flush: 'sync' })

  // ---------- 筛选 ----------
  const filteredCognates = computed(() =>
    COGNATE_SETS.filter(cs => {
      const q = searchQuery.value.toLowerCase()
      const matchSearch = !q || cs.root.toLowerCase().includes(q) || cs.meaning.includes(q) || Object.values(cs.languages).some((w: string) => w.toLowerCase().includes(q))
      const matchFamily = selectedFamily.value === 'all' || cs.family === selectedFamily.value
      return matchSearch && matchFamily
    })
  )

  const familyById = (id: string) => LANGUAGE_FAMILIES.find(f => f.id === id)
  const nodeById = (id: string | null): WordNode | null =>
    id ? (graph.value.nodes.find((n: WordNode) => n.id === id) ?? null) : null

  const selectedNode = computed<WordNode | null>(() => nodeById(selectedNodeId.value))

  /** 当前筛选结果中可见的同源词词根集合 */
  const visibleRoots = computed(() => new Set(filteredCognates.value.map(cs => cs.root)))

  /** 与筛选结果一致的图谱节点 */
  const visibleNodes = computed<WordNode[]>(() =>
    graph.value.nodes.filter((n: WordNode) => n.setRoot && visibleRoots.value.has(n.setRoot))
  )

  const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(n => n.id)))

  /** 与筛选结果一致的图谱连线 */
  const visibleLinks = computed(() =>
    graph.value.links.filter((l: any) => {
      const t = typeof l.target === 'object' ? l.target.id : l.target
      return visibleNodeIds.value.has(t)
    })
  )

  /** 签名变化时触发图谱重绘 */
  const graphSignature = computed(() =>
    filteredCognates.value.map(cs => cs.root).join('|')
  )

  // 手动调整筛选后，若已选节点被筛掉则清空，保持图谱/列表/详情一致
  watch(visibleNodeIds, (ids) => {
    if (selectedNodeId.value && !ids.has(selectedNodeId.value)) {
      selectedNodeId.value = null
    }
  }, { flush: 'sync' })

  // ---------- 视图缺口 ----------
  function viewGap(view: FilterView): ViewGap {
    return {
      missingFamily: view.familyId !== 'all' && !familyById(view.familyId),
      missingNode: !!view.selectedNodeId && !nodeById(view.selectedNodeId),
    }
  }

  const viewGaps = computed<Record<string, ViewGap>>(() => {
    const map: Record<string, ViewGap> = {}
    for (const v of views.value) map[v.id] = viewGap(v)
    return map
  })

  // ---------- 视图 CRUD ----------
  function saveCurrentView(name: string): FilterView {
    const view: FilterView = {
      id: 'view_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name: name.trim() || `视图 ${views.value.length + 1}`,
      familyId: selectedFamily.value,
      search: searchQuery.value,
      selectedNodeId: selectedNodeId.value && visibleNodeIds.value.has(selectedNodeId.value) ? selectedNodeId.value : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    views.value.push(view)
    return view
  }

  function renameView(id: string, name: string) {
    const v = views.value.find(x => x.id === id)
    if (v) { v.name = name.trim() || v.name; v.updatedAt = Date.now() }
  }

  function removeView(id: string) {
    views.value = views.value.filter(v => v.id !== id)
    // 同步清理进行中的恢复会话
    restoreQueue.value = restoreQueue.value.filter(v => v.id !== id)
    restoreResults.value = restoreResults.value.filter(r => r.viewId !== id)
    if (restoreIndex.value >= restoreQueue.value.length) {
      restoreIndex.value = Math.max(0, restoreQueue.value.length - 1)
    }
    if (restoreQueue.value.length === 0) restoreActive.value = false
  }

  function fixViewFamily(id: string, familyId: string) {
    const v = views.value.find(x => x.id === id)
    if (v) { v.familyId = familyId; v.updatedAt = Date.now() }
  }

  function fixViewNode(id: string, nodeId: string | null) {
    const v = views.value.find(x => x.id === id)
    if (v) { v.selectedNodeId = nodeId; v.updatedAt = Date.now() }
  }

  // ---------- 恢复 ----------
  /** 应用单组视图；调用方应先通过 viewGap 检查缺口 */
  function applyView(view: FilterView): RestoreResult {
    const gap = viewGap(view)
    if (gap.missingFamily || gap.missingNode) {
      const missing: string[] = []
      if (gap.missingFamily) missing.push('语系已不存在')
      if (gap.missingNode) missing.push('保存的词条已不存在')
      return {
        viewId: view.id, viewName: view.name, status: 'failed',
        message: `未恢复：${missing.join('、')}，请在视图列表中修正后重试`,
      }
    }

    searchQuery.value = view.search
    selectedFamily.value = view.familyId

    let droppedSelection = false
    if (view.selectedNodeId) {
      if (visibleNodeIds.value.has(view.selectedNodeId)) {
        selectedNodeId.value = view.selectedNodeId
      } else {
        // 引用本身有效，但已被自身筛选结果排除：清空选中并明确告知
        selectedNodeId.value = null
        droppedSelection = true
      }
    } else {
      selectedNodeId.value = null
    }

    const count = filteredCognates.value.length
    return {
      viewId: view.id, viewName: view.name,
      status: count === 0 ? 'restored-empty' : 'restored',
      droppedSelection,
      message:
        count === 0
          ? '已恢复筛选条件，但当前语系/搜索条件下没有匹配词条'
          : droppedSelection
            ? `已恢复，匹配 ${count} 组同源词；保存的选中词条不在筛选结果中，已清空选中`
            : `已恢复，匹配 ${count} 组同源词${view.selectedNodeId ? '，并定位到保存的词条' : ''}`,
    }
  }

  /** 多选视图一次恢复：逐条检查、逐条给出结果，成功者进入切换队列 */
  function batchRestore(selectedIds: string[]): RestoreResult[] {
    const picked = selectedIds
      .map(id => views.value.find(v => v.id === id))
      .filter((v): v is FilterView => !!v)

    const results: RestoreResult[] = picked.map(view => {
      const gap = viewGap(view)
      if (gap.missingFamily || gap.missingNode) {
        const missing: string[] = []
        if (gap.missingFamily) missing.push('语系已不存在')
        if (gap.missingNode) missing.push('保存的词条已不存在')
        return {
          viewId: view.id, viewName: view.name, status: 'failed',
          message: `未恢复：${missing.join('、')}，请修正缺口后重试`,
        }
      }
      return { viewId: view.id, viewName: view.name, status: 'restored', message: '' }
    })

    const ok = picked.filter((_, i) => results[i].status !== 'failed')

    if (ok.length > 0) {
      const applied: RestoreResult[] = []
      // 队列中的视图只保存引用快照，逐条切换时重新校验，防止切换前被删除
      restoreQueue.value = ok.map(v => ({ ...v }))
      restoreIndex.value = 0
      restoreActive.value = true
      applied.push(applyView(ok[0]))
      // 用真实应用结果替换第一项的占位结果
      const firstIdx = results.findIndex(r => r.viewId === ok[0].id)
      if (firstIdx >= 0) results[firstIdx] = applied[0]
      restoreResults.value = results
    } else {
      restoreQueue.value = []
      restoreIndex.value = 0
      restoreActive.value = false
      restoreResults.value = results
    }
    return results
  }

  /** 逐条切换到队列中的下一组视图 */
  function stepTo(index: number): RestoreResult | null {
    if (!restoreQueue.value.length) return null
    const i = Math.min(Math.max(index, 0), restoreQueue.value.length - 1)
    const snap = restoreQueue.value[i]
    const live = views.value.find(v => v.id === snap.id)
    restoreIndex.value = i
    if (!live) {
      const result: RestoreResult = {
        viewId: snap.id, viewName: snap.name, status: 'failed',
        message: '未恢复：该视图在会话过程中已被删除',
      }
      const idx = restoreResults.value.findIndex(r => r.viewId === snap.id)
      if (idx >= 0) restoreResults.value[idx] = result
      return result
    }
    const result = applyView(live)
    const idx = restoreResults.value.findIndex(r => r.viewId === live.id)
    if (idx >= 0) restoreResults.value[idx] = result
    return result
  }

  function stepNext(): RestoreResult | null {
    return stepTo(restoreIndex.value + 1)
  }

  function stepPrev(): RestoreResult | null {
    return stepTo(restoreIndex.value - 1)
  }

  function exitRestoreSession() {
    restoreActive.value = false
    restoreQueue.value = []
    restoreIndex.value = 0
    restoreResults.value = []
  }

  /** 关闭结果面板，但保留逐条切换队列 */
  function clearResults() {
    restoreResults.value = []
  }

  return {
    graph,
    searchQuery, selectedFamily,
    selectedNodeId, selectedNode,
    filteredCognates,
    visibleNodes, visibleLinks, visibleNodeIds, graphSignature,
    views, viewGaps, viewGap, nodeById,
    saveCurrentView, renameView, removeView, fixViewFamily, fixViewNode,
    applyView, batchRestore, stepTo, stepNext, stepPrev,
    restoreActive, restoreQueue, restoreIndex, restoreResults,
    exitRestoreSession, clearResults,
  }
})
