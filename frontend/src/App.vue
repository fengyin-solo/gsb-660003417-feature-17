<template>
  <div class="min-h-screen bg-slate-900 text-slate-200">
    <header class="border-b border-slate-700 px-6 py-4">
      <h1 class="text-2xl font-bold text-cyan-400">语言词源图谱与多语系演化追踪</h1>
      <p class="text-sm text-slate-500 mt-1">D3.js力导向图 · 印欧语系演化 · 同源词对照 · 500+词根</p>
    </header>
    <div class="p-4 space-y-4">
      <div class="grid lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-slate-400">词源力导向网络</h3>
            <div class="flex gap-3 text-xs">
              <span v-for="f in LANGUAGE_FAMILIES" :key="f.id" class="flex items-center gap-1">
                <span class="w-3 h-3 rounded-full" :style="{backgroundColor: f.color}"></span>{{ f.name }}
              </span>
            </div>
          </div>
          <svg ref="svgRef" class="w-full bg-slate-900 rounded cursor-pointer" style="height:460px"></svg>
          <p class="text-[11px] text-slate-500 mt-1">灰显节点不在当前筛选结果内且不可选；点击空白处清除选中。</p>
        </div>
        <div class="space-y-4">
          <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <h3 class="text-sm font-bold text-slate-400 mb-3">语系概览</h3>
            <div class="space-y-2">
              <div v-for="f in LANGUAGE_FAMILIES" :key="f.id" class="flex items-start gap-2 text-sm">
                <span class="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" :style="{backgroundColor: f.color}"></span>
                <div><div class="font-bold">{{ f.name }}</div><div class="text-xs text-slate-500">{{ f.era }} · {{ f.languages.join('/') }}</div></div>
              </div>
            </div>
          </div>
          <div v-if="store.selectedNode" class="bg-slate-800 rounded-lg p-4 border border-cyan-700">
            <h3 class="text-sm font-bold text-slate-400 mb-2">选中节点</h3>
            <div class="text-lg font-bold text-cyan-400">{{ store.selectedNode.word }}</div>
            <div class="text-sm text-slate-400">{{ store.selectedNode.language }} — {{ store.selectedNode.meaning }}</div>
            <div v-if="selectedRoot" class="text-xs text-slate-500 mt-1">词根 {{ selectedRoot.root }} · {{ selectedRoot.period }} · {{ store.selectedNode.era }}</div>
          </div>
          <div class="bg-slate-800 rounded-lg p-4 border border-slate-700 text-xs text-slate-400">
            <h3 class="text-sm font-bold text-slate-400 mb-2">Grimm定律</h3>
            <div class="space-y-1">
              <div class="bg-slate-900 rounded p-2"><span class="text-cyan-400">p→f: </span>pater → father</div>
              <div class="bg-slate-900 rounded p-2"><span class="text-green-400">t→θ: </span>tres → three</div>
              <div class="bg-slate-900 rounded p-2"><span class="text-orange-400">k→h: </span>cord → heart</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 筛选视图批次管理 -->
      <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 class="text-sm font-bold text-slate-400">筛选视图批次管理</h3>
          <div class="flex gap-2">
            <input v-model="newViewName" placeholder="视图名称（可留空自动命名）"
              class="w-52 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500" />
            <button @click="saveCurrent"
              class="bg-cyan-600 hover:bg-cyan-500 text-white rounded px-3 py-1.5 text-sm font-bold">
              保存当前筛选为视图
            </button>
          </div>
        </div>

        <!-- 逐条切换队列 -->
        <div v-if="store.queue.length" class="mb-3 flex flex-wrap items-center gap-2 bg-slate-900 border border-cyan-700 rounded px-3 py-2 text-sm">
          <span class="text-cyan-400 font-bold">▶ 恢复浏览</span>
          <span class="text-slate-300">{{ store.queueIndex + 1 }} / {{ store.queue.length }} 组：{{ currentQueueView?.name }}</span>
          <span class="text-xs text-slate-500">语系 {{ store.familyNameOf(currentQueueView?.family || 'all') }} · 关键词 “{{ currentQueueView?.searchQuery || '无' }}”</span>
          <div class="ml-auto flex gap-2">
            <button @click="store.gotoQueue(-1)" :disabled="store.queueIndex === 0"
              class="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded px-2 py-1 text-xs">← 上一组</button>
            <button @click="store.gotoQueue(1)" :disabled="store.queueIndex >= store.queue.length - 1"
              class="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded px-2 py-1 text-xs">下一组 →</button>
            <button @click="store.exitQueue()"
              class="bg-slate-700 hover:bg-slate-600 rounded px-2 py-1 text-xs">退出浏览</button>
          </div>
        </div>

        <!-- 恢复结果（逐条说明） -->
        <div v-if="results" class="mb-3 bg-slate-900 border border-slate-600 rounded p-3 text-sm">
          <div class="flex items-center justify-between mb-2">
            <span class="font-bold text-slate-300">
              恢复结果（共 {{ results.length }} 组：
              <span class="text-green-400">成功 {{ summary.success }}</span> ·
              <span class="text-amber-400">空结果 {{ summary.empty }}</span> ·
              <span class="text-red-400">失败 {{ summary.failed }}</span>）
            </span>
            <button @click="store.clearResults()" class="text-slate-500 hover:text-slate-300 text-xs">关闭</button>
          </div>
          <ul class="space-y-1.5">
            <li v-for="r in results" :key="r.viewId" class="rounded p-2 text-xs"
              :class="r.status === 'failed' ? 'bg-red-950/50 border border-red-800' : 'bg-slate-800'">
              <div class="flex items-center gap-2">
                <span class="font-bold px-1.5 py-0.5 rounded" :class="statusBadge(r.status)">{{ statusText(r.status) }}</span>
                <span class="font-bold text-slate-200">{{ r.viewName }}</span>
                <span class="text-slate-400">{{ r.message }}</span>
                <span v-if="r.rowCount !== null" class="text-slate-500">（匹配词条 {{ r.rowCount }} 条）</span>
              </div>
              <ul v-if="r.gaps.length" class="mt-1 ml-2 list-disc list-inside text-red-300 space-y-0.5">
                <li v-for="(g, gi) in r.gaps" :key="gi">{{ g.message }} —— 请在下方视图列表中标注处修正后重试</li>
              </ul>
            </li>
          </ul>
        </div>

        <!-- 批量操作工具条 -->
        <div v-if="store.views.length" class="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <button @click="toggleAll" class="bg-slate-700 hover:bg-slate-600 rounded px-2 py-1 text-xs">
            {{ allSelected ? '清空多选' : '全选' }}
          </button>
          <span class="text-xs text-slate-400">已选 {{ store.selectedViewIds.length }} / {{ store.views.length }} 组</span>
          <button @click="batchRestore" :disabled="!store.selectedViewIds.length"
            class="ml-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded px-3 py-1 text-xs font-bold">
            批量恢复所选（恢复后逐条切换）
          </button>
          <button @click="deleteSelected" :disabled="!store.selectedViewIds.length"
            class="bg-red-800 hover:bg-red-700 disabled:opacity-40 text-white rounded px-3 py-1 text-xs">
            删除所选
          </button>
        </div>

        <!-- 视图列表 -->
        <div v-if="store.views.length" class="space-y-2">
          <div v-for="v in store.views" :key="v.id"
            class="rounded border p-3"
            :class="gaps[v.id] ? 'border-red-700 bg-red-950/20' : 'border-slate-700 bg-slate-900'">
            <div class="flex flex-wrap items-center gap-2">
              <input type="checkbox" :checked="store.selectedViewIds.includes(v.id)"
                @change="store.toggleViewSelection(v.id)" class="accent-cyan-500" />
              <template v-if="renamingId === v.id">
                <input v-model="renamingValue" class="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-sm" />
                <button @click="confirmRename(v.id)" class="text-xs text-cyan-400">确认</button>
                <button @click="renamingId = null" class="text-xs text-slate-500">取消</button>
              </template>
              <template v-else>
                <span class="font-bold text-sm text-slate-200">{{ v.name }}</span>
                <button @click="startRename(v)" class="text-xs text-slate-500 hover:text-slate-300">重命名</button>
              </template>
              <span class="text-xs text-slate-500">{{ formatTime(v.updatedAt) }}</span>
              <div class="ml-auto flex gap-2">
                <button @click="store.restoreView(v)"
                  class="bg-emerald-700 hover:bg-emerald-600 text-white rounded px-2 py-0.5 text-xs">恢复此组</button>
                <button @click="store.deleteViews([v.id])"
                  class="bg-red-800/80 hover:bg-red-700 text-white rounded px-2 py-0.5 text-xs">删除</button>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
              <span class="text-slate-500">保存内容：</span>
              <span class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300">
                语系：{{ store.familyNameOf(v.family) }}
              </span>
              <span class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300">
                搜索：<span v-if="v.searchQuery">“{{ v.searchQuery }}”</span><span v-else class="text-slate-500">无</span>
              </span>
              <span class="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-300">
                图谱：<span v-if="v.node">{{ v.node.word }}（{{ v.node.language }}）</span><span v-else class="text-slate-500">不限节点</span>
              </span>
            </div>

            <!-- 缺口标注与修正 -->
            <div v-if="gaps[v.id]" class="mt-2 space-y-1.5">
              <div v-for="(g, gi) in gaps[v.id]" :key="gi" class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-bold text-red-400">缺口：</span>
                <span class="text-xs text-red-300">{{ g.message }}</span>
                <select v-if="g.kind === 'family'" :model-value="v.family"
                  @change="store.fixViewFamily(v.id, ($event.target as HTMLSelectElement).value)"
                  class="bg-slate-800 border border-red-700 rounded px-1 py-0.5 text-xs text-red-300">
                  <option :value="v.family" disabled>当前：{{ v.family }}（已失效，点此修正）</option>
                  <option value="all">修正为：全部语系</option>
                  <option v-for="f in LANGUAGE_FAMILIES" :key="f.id" :value="f.id">修正为：{{ f.name }}</option>
                </select>
                <select v-else :model-value="'__invalid__'"
                  @change="store.fixViewNode(v.id, ($event.target as HTMLSelectElement).value)"
                  class="bg-slate-800 border border-red-700 rounded px-1 py-0.5 text-xs text-red-300">
                  <option value="__invalid__" disabled>当前：{{ v.node?.word }}（{{ v.node?.language }}）已失效，点此修正</option>
                  <option value="">修正为：不选择节点</option>
                  <option v-for="c in v.node ? store.nodeCandidates(v.node) : []" :key="c.id" :value="c.id">
                    修正为：{{ c.word }}（{{ c.language }}）· {{ c.meaning }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="text-xs text-slate-500">
          暂无保存的视图。配置好语系、搜索词并在图谱中点选节点后，点击“保存当前筛选为视图”；之后可多选若干组一次恢复并逐条切换。
        </p>
      </div>

      <!-- 同源词对照表（原有单次筛选方式保留） -->
      <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <h3 class="text-sm font-bold text-slate-400 mb-3">同源词对照表</h3>
        <div class="flex gap-2 mb-3">
          <input v-model="store.searchQuery" placeholder="搜索词根/含义..." class="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500" />
          <select v-model="store.selectedFamily" class="bg-slate-900 border border-slate-600 rounded px-2 text-sm text-slate-300">
            <option value="all">全部语系</option>
            <option v-for="f in LANGUAGE_FAMILIES" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>
        <div class="overflow-x-auto max-h-64 overflow-y-auto">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-slate-700">
              <tr>
                <th class="px-2 py-2 text-left text-slate-300">词根</th>
                <th class="px-2 py-2 text-left text-slate-300">含义</th>
                <th class="px-2 py-2 text-left text-cyan-400">英语</th>
                <th class="px-2 py-2 text-left text-blue-400">法语</th>
                <th class="px-2 py-2 text-left text-green-400">德语</th>
                <th class="px-2 py-2 text-left text-orange-400">西班牙语</th>
                <th class="px-2 py-2 text-left text-purple-400">俄语</th>
                <th class="px-2 py-2 text-left text-yellow-400">拉丁语</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableRows" :key="row.cs.root"
                :ref="(el) => registerRowEl(row.idx, el)"
                @click="store.selectRow(row.idx)"
                class="border-t border-slate-700 cursor-pointer"
                :class="store.selectedRootIndex === row.idx ? 'bg-cyan-900/40' : 'hover:bg-slate-700'">
                <td class="px-2 py-1.5 font-mono text-slate-200 font-bold">{{ row.cs.root }}</td>
                <td class="px-2 py-1.5 text-slate-400">{{ row.cs.meaning }}</td>
                <td class="px-2 py-1.5 font-mono text-cyan-300">{{ row.cs.languages['英语'] || '—' }}</td>
                <td class="px-2 py-1.5 font-mono text-blue-300">{{ row.cs.languages['法语'] || '—' }}</td>
                <td class="px-2 py-1.5 font-mono text-green-300">{{ row.cs.languages['德语'] || '—' }}</td>
                <td class="px-2 py-1.5 font-mono text-orange-300">{{ row.cs.languages['西班牙语'] || '—' }}</td>
                <td class="px-2 py-1.5 font-mono text-purple-300">{{ row.cs.languages['俄语'] || '—' }}</td>
                <td class="px-2 py-1.5 font-mono text-yellow-300">{{ row.cs.languages['拉丁语'] || '—' }}</td>
              </tr>
              <tr v-if="!tableRows.length">
                <td colspan="8" class="px-2 py-4 text-center text-slate-500">没有符合当前筛选的词条</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import * as d3 from 'd3'
import { useEtymologyStore, LANGUAGE_FAMILIES } from './store/etymology'
import { COGNATE_SETS } from './mock/data'
import type { WordNode, WordLink, FilterView, RestoreItemResult } from './types'

const store = useEtymologyStore()
const svgRef = ref<SVGSVGElement | null>(null)
const COLORS: Record<string, string> = { ie: '#3b82f6', st: '#22c55e', aa: '#f59e0b', ural: '#8b5cf6' }

let nodeSel: d3.Selection<SVGGElement, WordNode, SVGGElement, unknown> | null = null
let linkSel: d3.Selection<SVGLineElement, WordLink, SVGGElement, unknown> | null = null
const rowEls = new Map<number, HTMLElement>()

/* ---------------- 视图批次面板本地状态 ---------------- */
const newViewName = ref('')
const renamingId = ref<string | null>(null)
const renamingValue = ref('')

const gaps = computed(() => store.gapsMap())
const results = computed(() => store.restoreResults)
const currentQueueView = computed<FilterView | null>(
  () => store.queue.length ? store.queue[store.queueIndex] : null
)
const summary = computed(() => {
  const s = { success: 0, empty: 0, failed: 0 }
  results.value?.forEach((r: RestoreItemResult) => { s[r.status] += 1 })
  return s
})
const allSelected = computed(
  () => store.views.length > 0 && store.selectedViewIds.length === store.views.length
)
const tableRows = computed(() => store.filteredCognates.map(cs => {
  const idx = COGNATE_SETS.indexOf(cs)
  return { cs, idx }
}))
const selectedRoot = computed(() =>
  store.selectedRootIndex !== null ? COGNATE_SETS[store.selectedRootIndex] : null
)

function saveCurrent() {
  store.saveCurrentView(newViewName.value)
  newViewName.value = ''
}

function toggleAll() {
  allSelected.value ? store.clearViewSelection() : store.selectAllViews()
}

function batchRestore() {
  store.batchRestore()
}

function deleteSelected() {
  if (!store.selectedViewIds.length) return
  if (window.confirm(`确定删除选中的 ${store.selectedViewIds.length} 组视图？`)) {
    store.deleteViews([...store.selectedViewIds])
  }
}

function startRename(v: FilterView) {
  renamingId.value = v.id
  renamingValue.value = v.name
}

function confirmRename(id: string) {
  store.renameView(id, renamingValue.value)
  renamingId.value = null
}

function statusText(s: RestoreItemResult['status']) {
  return s === 'success' ? '成功' : s === 'empty' ? '空结果' : '失败'
}
function statusBadge(s: RestoreItemResult['status']) {
  return s === 'success'
    ? 'bg-green-800 text-green-200'
    : s === 'empty'
      ? 'bg-amber-800 text-amber-200'
      : 'bg-red-800 text-red-200'
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function registerRowEl(idx: number, el: Element | { $el?: Element } | null) {
  const tr = (el as any)?.$el || el
  if (tr) rowEls.set(idx, tr as HTMLElement)
  else rowEls.delete(idx)
}

/* ---------------- 图谱绘制与筛选/选中联动 ---------------- */
function drawGraph() {
  if (!svgRef.value) return
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()
  const W = svgRef.value.getBoundingClientRect().width || 700, H = 460
  const dataNodes = store.graph.nodes.map((n: WordNode) => ({ ...n }))
  const dataLinks = store.graph.links.map((l: WordLink) => ({ ...l }))
  const sim = d3.forceSimulation(dataNodes as any)
    .force('link', d3.forceLink(dataLinks as any).id((d: any) => d.id).distance(55))
    .force('charge', d3.forceManyBody().strength(-100))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(22))
  const g = svg.append('g')
  svg.on('click', () => { store.selectedNode = null })
  svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 3]).on('zoom', (e) => g.attr('transform', e.transform)) as any)
  const linkG = g.append('g').selectAll<SVGLineElement, WordLink>('line').data(dataLinks).join('line')
    .attr('class', 'et-link')
    .attr('stroke', '#475569').attr('stroke-width', 1).attr('opacity', 0.5) as any as d3.Selection<SVGLineElement, WordLink, SVGGElement, unknown>
  const nodeG = g.append('g').selectAll<SVGGElement, WordNode>('g').data(dataNodes).join('g')
    .attr('class', 'et-node')
    .call(d3.drag<any, any>()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }))
    .on('click', (e: MouseEvent, d: WordNode) => {
      e.stopPropagation()
      if (typeof d.rootIndex === 'number' && store.filteredRootIndexes.has(d.rootIndex)) {
        store.selectedNode = d
      }
    }) as any as d3.Selection<SVGGElement, WordNode, SVGGElement, unknown>
  nodeG.append('circle')
    .attr('r', (d) => d.language === 'Proto-IE' ? 12 : 7)
    .attr('fill', (d) => COLORS[d.family] || '#64748b')
    .attr('stroke', '#1e293b').attr('stroke-width', 1.5)
  nodeG.append('text').attr('dy', -14).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#e2e8f0')
    .text((d) => d.word.length > 8 ? d.word.slice(0, 8) + '…' : d.word)
  nodeG.append('title').text((d) => `${d.word} (${d.language}): ${d.meaning}`)
  linkSel = linkG
  nodeSel = nodeG
  sim.on('tick', () => {
    linkG.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y)
    nodeG.attr('transform', (d) => `translate(${d.x},${d.y})`)
  })
  updateDim()
  updateSelected()
}

/** 筛选变化：只灰显/恢复，不重跑力学布局；图谱与筛选结果保持一致 */
function updateDim() {
  if (!nodeSel || !linkSel) return
  const visible = store.filteredRootIndexes
  nodeSel.classed('et-dim', (d) => typeof d.rootIndex !== 'number' || !visible.has(d.rootIndex))
  linkSel.classed('et-dim', (d) => {
    const ri = (d as any).rootIndex as number | undefined
    return typeof ri !== 'number' || !visible.has(ri)
  })
}

/** 详情/列表/图谱三处选中状态一致 */
function updateSelected() {
  const sel = nodeSel
  if (!sel) return
  const id = store.selectedNode?.id
  sel.select('circle')
    .classed('et-selected', (d) => id === d.id)
    .attr('stroke', (d) => id === d.id ? '#22d3ee' : '#1e293b')
    .attr('stroke-width', (d) => id === d.id ? 3 : 1.5)
}

watch(() => store.filteredRootIndexes, updateDim, { deep: false })
watch(() => store.selectedNode?.id, updateSelected)
watch(() => store.selectedRootIndex, async (idx) => {
  if (idx === null) return
  await nextTick()
  rowEls.get(idx)?.scrollIntoView({ block: 'nearest' })
})

onMounted(() => { setTimeout(drawGraph, 100) })
</script>
