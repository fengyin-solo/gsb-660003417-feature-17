<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-300">筛选视图批次管理</h3>
      <span class="text-xs text-slate-500">保存当前语系 / 搜索条件 / 图谱选中，多选后一次恢复并逐条切换</span>
    </div>

    <!-- 保存当前筛选 -->
    <div class="flex flex-wrap items-center gap-2 bg-slate-900 rounded p-2 mb-3">
      <input
        v-model="newViewName"
        placeholder="为当前筛选条件命名…"
        class="flex-1 min-w-[180px] bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500"
        @keyup.enter="saveView"
      />
      <span class="text-xs text-slate-400 whitespace-nowrap">
        当前：{{ familyName(store.selectedFamily) }} ·
        关键词「{{ store.searchQuery || '空' }}」·
        {{ nodeLabel(store.selectedNode) }}
      </span>
      <button
        class="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold px-3 py-1.5 rounded"
        :disabled="!newViewName.trim()"
        @click="saveView"
      >保存为视图</button>
    </div>

    <!-- 批量操作栏 -->
    <div v-if="store.views.length" class="flex flex-wrap items-center gap-2 mb-2">
      <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
        <input type="checkbox" :checked="allChecked" :indeterminate.prop="someChecked && !allChecked" @change="toggleAll" />
        全选
      </label>
      <span class="text-xs text-slate-500">已选 {{ selectedIds.length }} 组</span>
      <button
        class="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs px-3 py-1 rounded"
        :disabled="!selectedIds.length"
        @click="batchRestore"
      >批量恢复并逐条切换</button>
      <button
        class="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-300 text-xs px-3 py-1 rounded"
        :disabled="!selectedIds.length"
        @click="deleteSelected"
      >删除所选</button>
    </div>

    <!-- 视图列表 -->
    <div v-if="store.views.length" class="space-y-1.5 max-h-72 overflow-y-auto pr-1">
      <div
        v-for="v in store.views"
        :id="'view-row-' + v.id"
        :key="v.id"
        class="rounded border px-2.5 py-2 text-xs transition-colors"
        :class="[
          isActiveInSession(v.id) ? 'border-cyan-500 bg-cyan-950/40' : 'border-slate-700 bg-slate-900',
          rowFlashId === v.id ? 'ring-2 ring-amber-400' : '',
        ]"
      >
        <div class="flex items-center gap-2">
          <input type="checkbox" class="flex-shrink-0" :value="v.id" v-model="selectedIds" />
          <template v-if="editingId === v.id">
            <input
              ref="editInput"
              v-model="editName"
              class="flex-1 min-w-0 bg-slate-800 border border-cyan-500 rounded px-2 py-0.5 text-xs"
              @keyup.enter="commitRename(v.id)"
              @blur="commitRename(v.id)"
            />
          </template>
          <template v-else>
            <button class="flex-1 min-w-0 text-left font-bold text-slate-200 truncate hover:text-cyan-300" @click="startRename(v)">
              {{ v.name }}
            </button>
          </template>
          <span v-if="isActiveInSession(v.id)" class="text-cyan-400 font-bold flex-shrink-0">▶ 当前</span>
          <button class="text-blue-400 hover:text-blue-300 flex-shrink-0" title="恢复此视图" @click="store.batchRestore([v.id])">恢复</button>
          <button class="text-slate-500 hover:text-slate-300 flex-shrink-0" title="重命名" @click="startRename(v)">改名</button>
          <button class="text-red-400 hover:text-red-300 flex-shrink-0" title="删除" @click="store.removeView(v.id)">✕</button>
        </div>

        <!-- 视图内容摘要 -->
        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 pl-6">
          <span>语系：<span :class="gap(v).missingFamily ? 'text-red-400 line-through' : 'text-slate-400'">
            {{ v.familyId === 'all' ? '全部语系' : (familyById(v.familyId)?.name ?? `未知(${v.familyId})`) }}
          </span></span>
          <span>关键词：<span class="text-slate-400">{{ v.search || '空' }}</span></span>
          <span>选中：<span :class="gap(v).missingNode ? 'text-red-400 line-through' : 'text-slate-400'">
            {{ v.selectedNodeId ? (nodeById(v.selectedNodeId) ? nodeLabel(nodeById(v.selectedNodeId)!) : `缺失词条(${v.selectedNodeId})`) : '无' }}
          </span></span>
        </div>

        <!-- 缺口标注与修正 -->
        <div v-if="gap(v).missingFamily || gap(v).missingNode" class="mt-1.5 ml-6 flex flex-wrap items-center gap-2 rounded bg-red-950/40 border border-red-900 px-2 py-1">
          <span class="text-red-400 font-bold">⚠ 缺口：</span>
          <span v-if="gap(v).missingFamily" class="text-red-300">语系已失效，请改选：</span>
          <select
            v-if="gap(v).missingFamily"
            class="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-slate-300"
            @change="store.fixViewFamily(v.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="all">全部语系</option>
            <option v-for="f in LANGUAGE_FAMILIES" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
          <span v-if="gap(v).missingNode" class="text-red-300">词条已失效，请改选：</span>
          <select
            v-if="gap(v).missingNode"
            class="bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-slate-300 max-w-[280px]"
            @change="onFixNode(v.id, ($event.target as HTMLSelectElement).value)"
          >
            <option :value="''">— 请选择有效词条（或设为不选中）—</option>
            <option :value="'__none__'">不选中任何节点</option>
            <optgroup v-for="cs in COGNATE_SETS" :key="cs.root" :label="`${cs.root} ${cs.meaning}`">
              <option :value="'root_' + cs.root">词根 {{ cs.root }}</option>
              <option v-for="(word, lang) in cs.languages" :key="lang" :value="'node_' + cs.root + '_' + lang">
                {{ lang }}「{{ word }}」
              </option>
            </optgroup>
          </select>
        </div>
      </div>
    </div>
    <div v-else class="text-xs text-slate-500 text-center py-3">暂无保存的视图，配置好上方筛选后点击「保存为视图」</div>

    <!-- 逐条切换栏 -->
    <div v-if="store.restoreActive && store.restoreQueue.length" class="mt-3 flex flex-wrap items-center gap-2 bg-blue-950/40 border border-blue-900 rounded px-3 py-2">
      <span class="text-xs font-bold text-blue-300">恢复会话</span>
      <button class="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-xs px-2 py-1 rounded text-slate-200" :disabled="store.restoreIndex === 0" @click="store.stepPrev()">← 上一组</button>
      <span class="text-xs text-slate-300">{{ store.restoreIndex + 1 }} / {{ store.restoreQueue.length }} · {{ currentQueueName }}</span>
      <button class="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-xs px-2 py-1 rounded text-slate-200" :disabled="store.restoreIndex >= store.restoreQueue.length - 1" @click="store.stepNext()">下一组 →</button>
      <button class="bg-slate-700 hover:bg-slate-600 text-xs px-2 py-1 rounded text-slate-400 ml-auto" @click="store.exitRestoreSession()">退出会话</button>
    </div>

    <!-- 批量恢复结果：逐条说明 -->
    <div v-if="store.restoreResults.length" class="mt-3 border border-slate-700 rounded">
      <div class="flex items-center justify-between px-3 py-1.5 bg-slate-900 rounded-t">
        <span class="text-xs font-bold text-slate-300">
          恢复结果（{{ successCount }} 成功 / {{ failCount }} 失败{{ emptyCount ? ` / ${emptyCount} 无匹配` : '' }}）
        </span>
        <button class="text-xs text-slate-500 hover:text-slate-300" @click="store.clearResults()">关闭</button>
      </div>
      <ul class="max-h-44 overflow-y-auto divide-y divide-slate-700">
        <li v-for="r in store.restoreResults" :key="r.viewId" class="px-3 py-1.5 flex items-start gap-2 text-xs">
          <span v-if="r.status === 'restored'" class="text-green-400 font-bold flex-shrink-0">✓</span>
          <span v-else-if="r.status === 'restored-empty'" class="text-amber-400 font-bold flex-shrink-0">○</span>
          <span v-else class="text-red-400 font-bold flex-shrink-0">✗</span>
          <div class="min-w-0">
            <span class="font-bold text-slate-300">{{ r.viewName }}</span>
            <span class="text-slate-400">：{{ r.message }}</span>
          </div>
          <button
            v-if="r.status === 'failed'"
            class="ml-auto flex-shrink-0 text-amber-400 hover:text-amber-300 underline"
            @click="jumpToFix(r.viewId)"
          >去修正</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useEtymologyStore, LANGUAGE_FAMILIES, COGNATE_SETS, nodeLabel } from '../store/etymology'
import type { WordNode } from '../types'

const store = useEtymologyStore()
const newViewName = ref('')
const selectedIds = ref<string[]>([])
const editingId = ref<string | null>(null)
const editName = ref('')
const rowFlashId = ref<string | null>(null)

const familyById = (id: string) => LANGUAGE_FAMILIES.find(f => f.id === id)
const familyName = (id: string) => id === 'all' ? '全部语系' : familyById(id)?.name ?? '未知语系'
const nodeById = (id: string | null): WordNode | null => store.nodeById(id)
const gap = (v: { id: string }) => store.viewGaps[v.id] ?? { missingFamily: false, missingNode: false }

const allChecked = computed(() => store.views.length > 0 && selectedIds.value.length === store.views.length)
const someChecked = computed(() => selectedIds.value.length > 0)

const successCount = computed(() => store.restoreResults.filter(r => r.status === 'restored').length)
const failCount = computed(() => store.restoreResults.filter(r => r.status === 'failed').length)
const emptyCount = computed(() => store.restoreResults.filter(r => r.status === 'restored-empty').length)

const currentQueueName = computed(() => store.restoreQueue[store.restoreIndex]?.name ?? '')

function saveView() {
  if (!newViewName.value.trim()) return
  const v = store.saveCurrentView(newViewName.value)
  newViewName.value = ''
  selectedIds.value.push(v.id)
}

function toggleAll() {
  selectedIds.value = allChecked.value ? [] : store.views.map(v => v.id)
}

function deleteSelected() {
  for (const id of [...selectedIds.value]) store.removeView(id)
  selectedIds.value = selectedIds.value.filter(id => store.views.some(v => v.id === id))
}

function batchRestore() {
  if (!selectedIds.value.length) return
  store.batchRestore([...selectedIds.value])
}

function startRename(v: { id: string; name: string }) {
  editingId.value = v.id
  editName.value = v.name
}

function commitRename(id: string) {
  if (editingId.value === id) {
    store.renameView(id, editName.value)
    editingId.value = null
  }
}

function onFixNode(id: string, value: string) {
  store.fixViewNode(id, value === '__none__' || value === '' ? null : value)
}

function isActiveInSession(id: string) {
  return store.restoreActive && store.restoreQueue[store.restoreIndex]?.id === id
}

async function jumpToFix(viewId: string) {
  rowFlashId.value = null
  await nextTick()
  rowFlashId.value = viewId
  document.getElementById('view-row-' + viewId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => { if (rowFlashId.value === viewId) rowFlashId.value = null }, 2500)
}
</script>
