<script setup lang="ts">
import { nextTick, ref } from 'vue'
import AnalysisDashboard from './components/AnalysisDashboard.vue'
import { schemaExamples } from './examples/schemas'
import { parseInstruction } from './services/parseInstruction'
import { analyzeDashboard } from './services/analyzeDashboard'
import type { DashboardResult } from './types/analysis'
import type { DashboardSchema } from './types/schema'

type Message = { role: 'user' | 'assistant'; content: string; error?: boolean; dashboard?: DashboardResult }
const messages = ref<Message[]>([])
const input = ref('')
const mode = ref('local')
const current = ref<DashboardSchema>()
const list = ref<HTMLElement>()
const examples = schemaExamples.map(example => example.instruction)
const stage = ref('')
const busy = ref(false)
const shortExamples = ['分析 A 公司股价与成交量', '查看 B 公司股价走势', '找出 A 公司最大涨幅', '看看 B 公司成交量', '对比 A、B 公司走势']
async function scroll() { await nextTick(); list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }) }
async function send() {
  const text = input.value.trim()
  if (!text || busy.value) return
  messages.value.push({ role: 'user', content: text }); input.value = ''
  if (mode.value === 'model') messages.value.push({ role: 'assistant', content: '大模型模式将在后续阶段接入。目前请选择左下角的「本地模式」继续体验。', error: true })
  else {
    busy.value = true
    try {
      stage.value = '理解需求 → 生成 Schema'; await nextTick()
      const followDays = text.match(/^改为最近\s*(\d+)\s*个?交易日[。.!！]?$/)
      const followMetric = /^把成交量改(?:成|为)涨跌幅[。.!！]?$/.test(text)
      let schema: DashboardSchema
      if (current.value && followDays) {
        const days = Number(followDays[1])
        schema = { ...current.value, title: current.value.title.replace(/近 \d+ 个交易日/, `近 ${days} 个交易日`), timeRange: { type: 'tradingDays', count: days } }
      } else if (current.value && followMetric) {
        if (!current.value.charts.some(chart => chart.metric === 'volume')) throw new Error('当前看板没有成交量图表，请先生成包含成交量的看板。')
        schema = { ...current.value, charts: current.value.charts.map(chart => chart.metric === 'volume' ? { title: '每日涨跌幅', metric: 'dailyChange', type: chart.type, unit: '%' } : chart), analysis: current.value.analysis.filter(item => item.type !== 'highestVolume') }
      } else {
        const parsed = parseInstruction(text)
        if (!parsed.success) throw new Error(`${parsed.stage}：${parsed.message}`)
        schema = parsed.schema
      }
      stage.value = '校验 Schema → 处理数据'; await nextTick()
      const result = analyzeDashboard(schema)
      if (!result.success) throw new Error(`${result.stage}：${result.message}`)
      stage.value = '渲染图表'; await nextTick()
      current.value = result.data.schema
      messages.value.push({ role: 'assistant', content: '已根据你的需求生成本地分析看板。', dashboard: result.data })
      await nextTick()
    } catch (e) { messages.value.push({ role: 'assistant', content: e instanceof Error ? e.message : '处理失败，请调整需求后重试。', error: true }) }
    finally { busy.value = false; stage.value = '' }
  }
  await scroll()
}
function choose(i: number) { input.value = examples[i] }
function reset() { messages.value = []; current.value = undefined; input.value = '' }
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">▥</div><div><strong>问数</strong><small>WENSHU / STOCK INSIGHTS</small></div></div>
      <button class="new-chat" :disabled="busy" @click="reset"><span>＋</span> 新建对话 </button>
      <div class="side-label">工作空间</div>
      <div class="nav-active"><span>◫</span> 数据分析 <span class="nav-dot"></span></div>
      <div class="side-bottom"><div class="side-icon">✳</div><div><strong>本地演示环境</strong><small>模拟数据 · 无需联网</small></div><span class="online"></span></div>
    </aside>
    <main class="main">
      <header class="topbar"><div class="breadcrumb">工作空间 <span>/</span> <strong>数据分析</strong></div><div class="top-right"><span class="status-dot"></span> 本地环境 <span class="divider"></span><span class="avatar">数</span></div></header>
      <div ref="list" class="content-scroll">
        <div class="content">
          <section v-if="!messages.length" class="welcome">
            <div class="eyebrow"><span></span> YOUR STOCK ANALYSIS ASSISTANT</div>
            <h1>你好，今天想<span>了解什么？</span></h1>
            <p class="intro">用自然语言提问，轻松探索股票数据。<br>从一个问题开始，发现数据背后的变化。</p>
            <div class="suggestion-heading"><span>试试这样问</span><small>选择一个示例开始</small></div>
            <div class="suggestions"><button v-for="(item, i) in shortExamples" :key="item" @click="choose(i)"><span class="suggest-icon">{{ ['↗','⌁','✳','▥','⇄'][i] }}</span><span>{{ item }}<small>{{ ['近 30 个交易日 · 跌幅排名','近 10 个交易日 · 最高与最低','近 20 个交易日 · 每日涨跌幅','近 15 个交易日 · 成交量排名','近 30 个交易日 · 区间涨跌幅'][i] }}</small></span><span class="arrow">↗</span></button></div>
          </section>
          <section v-else class="conversation"><div class="conversation-title"><div><div class="eyebrow"><span></span> ANALYSIS CONVERSATION</div><h2>数据分析对话</h2></div><button class="clear" :disabled="busy" @click="reset">＋ 新建对话</button></div><div v-for="(message, i) in messages" :key="i" class="message" :class="message.role"><div class="message-avatar">{{ message.role === 'user' ? '我' : '▥' }}</div><div class="message-body"><div class="message-label">{{ message.role === 'user' ? '你' : '问数助手' }} <span v-if="message.role === 'assistant'">· {{ message.error ? '提示' : '本地分析' }}</span></div><div class="bubble" :class="{error:message.error}">{{ message.content }}</div><AnalysisDashboard v-if="message.dashboard" :result="message.dashboard" /></div></div><p v-if="stage" class="processing" role="status">{{ stage }}…</p></section>
        </div>
      </div>
      <div class="composer-wrap"><form class="composer" @submit.prevent="send"><label class="sr-only" for="prompt">输入分析需求</label><textarea id="prompt" v-model="input" rows="2" placeholder="输入你的问题，例如：分析 A 公司最近 30 个交易日的股价..." @keydown.enter.exact.prevent="send"></textarea><div class="composer-bottom"><label class="mode"><span class="mode-dot"></span><select v-model="mode" :disabled="busy" aria-label="选择分析模式"><option value="local">本地模式</option><option value="model">大模型模式</option></select><span class="chevron">⌄</span></label><div class="send-group"><span>Enter 发送 · Shift + Enter 换行</span><button class="send" :disabled="!input.trim() || busy" aria-label="发送消息">↑</button></div></div></form><div class="disclaimer">内容基于模拟数据生成，仅供功能演示，不构成投资建议。</div></div>
    </main>
  </div>
</template>

