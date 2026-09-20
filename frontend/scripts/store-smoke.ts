/* 头无界面逻辑测试：缺口检测 / 批量恢复 / 队列 / 修正 / 一致性 */
class MemStore {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
}
;(globalThis as any).localStorage = new MemStore()
;(globalThis as any).window = { confirm: () => true }

import { setActivePinia, createPinia } from 'pinia'
import { useEtymologyStore, COGNATE_SETS } from '../src/store/etymology'
import type { FilterView } from '../src/types'

let passed = 0, failed = 0
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log('  ✓', msg) }
  else { failed++; console.error('  ✗ FAIL:', msg) }
}

setActivePinia(createPinia())
const s = useEtymologyStore()

console.log('1) 种子视图')
assert(s.views.length === 2, `首次使用注入 2 条示例视图（实际 ${s.views.length}）`)
assert(s.selectedViewIds.length === 0, '种子视图不默认勾选，由用户决定多选')
const gapView = s.views.find(v => v.family === 'anatolian')!
const okView = s.views.find(v => v.family === 'ie')!
assert(!!gapView, '存在含缺口的示例视图')
assert(s.evaluateGaps(gapView).length === 2, '缺口语系+缺失词条各算一处缺口')
assert(s.evaluateGaps(okView).length === 0, '完好视图无缺口')

console.log('2) 保存当前视图')
s.searchQuery = '夜晚'
s.selectedFamily = 'ie'
const rootNode = s.graph.nodes.find((n: any) => n.language === 'Proto-IE' && n.meaning === '夜晚')
s.selectedNode = rootNode
const saved = s.saveCurrentView('夜间视图')
assert(saved.searchQuery === '夜晚' && saved.family === 'ie', '保存语系+搜索条件')
assert(saved.node?.word === '*nokʷt-' && saved.node.language === 'Proto-IE', '保存图谱选中节点引用')
assert(s.views.length === 3, '视图总数变为 3')
assert(s.selectedViewIds.includes(saved.id), '用户新保存的视图自动加入多选')

console.log('3) 批量恢复：逐条结果 + 队列')
s.selectedViewIds = [okView.id, gapView.id, saved.id]
const results = s.batchRestore()
assert(results.length === 3, '批量恢复返回 3 条逐条结果')
assert(results[0].status === 'success' && results[0].rowCount >= 1, '完好视图成功并报告匹配条数')
assert(results[1].status === 'failed' && results[1].gaps.length === 2, '缺口视图失败且列出 2 处缺口，未应用')
assert(results[2].status === 'success', '第三条成功')
assert(s.queue.length === 2, '失败项不进入浏览队列（队列 2 组）')
assert(s.queueIndex === 0 && s.familyNameOf(s.queue[0].family) === '印欧语系', '队列定位在第 1 组并已应用')
assert(s.selectedFamily === okView.family && s.searchQuery === okView.searchQuery, '当前筛选已恢复为第 1 组')
// 种子视图 query="水"，aqua 属于含义为“水”的同源词组 → 应被选中
assert(s.selectedNode?.word === 'aqua' && s.selectedRootIndex === 3, '图谱选择随视图恢复且属于筛选结果')

console.log('4) 逐条切换')
s.gotoQueue(1)
assert(s.queueIndex === 1, '切换到第 2 组')
assert(s.searchQuery === '夜晚' && s.selectedNode?.word === '*nokʷt-', '第 2 组的筛选与选中已应用')
assert(COGNATE_SETS[s.selectedRootIndex!].meaning === '夜晚', '列表/详情选中行与图谱一致')
s.gotoQueue(1)
assert(s.queueIndex === 1, '已是末组，下一组不会越界')
s.gotoQueue(-1)
assert(s.queueIndex === 0 && s.searchQuery === '水', '返回第 1 组')

console.log('5) 空结果状态')
const empty: FilterView = { id: 'x', name: '空', family: 'ie', searchQuery: '不存在的词zzz', node: null, createdAt: 1, updatedAt: 1 }
const er = s.restoreView(empty)
assert(er.status === 'empty' && er.rowCount === 0, '条件有效但无匹配 → empty 逐条说明')
assert(s.searchQuery === '不存在的词zzz', 'empty 视图同样应用筛选')
s.clearResults()
assert(s.restoreResults === null, '结果面板可关闭')

console.log('6) 修正缺口后可恢复')
s.fixViewFamily(gapView.id, 'all')
assert(s.evaluateGaps(gapView).some(g => g.kind === 'family') === false, '语系缺口修正后消失')
const cand = s.nodeCandidates(gapView.node!)
assert(cand.some(c => c.word === 'light' && c.language === '英语'), '候选包含同语义词 light(英语)')
s.fixViewNode(gapView.id, cand.find(c => c.word === 'light' && c.language === '英语')!.id)
assert(s.evaluateGaps(gapView).length === 0, '词条缺口修正后视图完好')
const rr = s.restoreView(gapView)
assert(rr.status === 'success', '修正后恢复成功')
assert(/节点不在筛选结果中/.test(rr.message) && s.selectedNode === null, '逐条说明节点被筛选排除并已清除选中')

// 把搜索改成与修正节点相符后再恢复：节点选择应一并恢复
s.fixViewFamily(gapView.id, 'ie')
const sunView: FilterView = {
  id: 'vlight', name: '光视图', family: 'ie', searchQuery: '光',
  node: { word: 'light', language: '英语', meaning: '光/亮' },
  createdAt: 1, updatedAt: 1,
}
const rr2 = s.restoreView(sunView)
assert(rr2.status === 'success' && s.selectedNode?.word === 'light', '筛选可命中时，图谱选择随恢复命中')
assert(s.selectedRootIndex === 7, '恢复后详情/列表选中行与图谱节点一致')

console.log('7) 修正为不选节点')
s.fixViewNode(gapView.id, '')
assert(gapView.node === null && s.evaluateGaps(gapView).length === 0, '清除节点引用不产生缺口')

console.log('8) 手动筛选时选中一致性')
s.selectedNode = s.graph.nodes.find((n: any) => n.word === 'aqua' && n.language === '英语')
s.searchQuery = 'zzz-nomatch'
assert(s.selectedNode === null, '选中节点被筛掉时自动清除（图谱/列表/详情一致）')

console.log('9) 列表点击只选可见行')
s.searchQuery = ''
s.selectedFamily = 'all'
const nightIdx = COGNATE_SETS.findIndex(c => c.meaning === '夜晚')
s.selectRow(nightIdx)
assert(s.selectedNode?.language === 'Proto-IE' && s.selectedRootIndex === nightIdx, '点击列表行选中对应词根节点')
s.selectedFamily = 'st' // 汉藏语系下不含任何印欧词组
const before = s.selectedRootIndex
assert(before === null, '切走语系时筛外选中被自动清除')
s.selectRow(nightIdx)
assert(s.selectedRootIndex === null, '被筛掉的行不可通过列表选中')
s.selectedFamily = 'all'

console.log('10) 删除与队列联动')
s.searchQuery = ''; s.selectedFamily = 'all'
s.selectedViewIds = [okView.id, saved.id]
s.batchRestore()
assert(s.queue.length === 2, '重建队列 2 组')
s.deleteViews([okView.id])
assert(s.queue.length === 1 && s.searchQuery === '夜晚', '删除当前浏览项后队列收缩并应用相邻组')
assert(!s.views.some(v => v.id === okView.id), '视图已删除')

console.log(`\n结果：${passed} 通过，${failed} 失败`)
if (failed) process.exit(1)
