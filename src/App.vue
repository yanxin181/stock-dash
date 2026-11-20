<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import AnalysisDashboard from './components/AnalysisDashboard.vue'
import { schemaExamples } from './examples/schemas'
import { runAnalysis, type AnalysisMode } from './services/runAnalysis'
import { getInputSuggestions, type InputSuggestion } from './services/inputSuggestions'
import type { DashboardResult } from './types/analysis'
import type { DashboardSchema } from './types/schema'

type Mode = AnalysisMode
type Message = { role: 'user' | 'assistant'; content: string; mode: Mode; error?: boolean; offerLocal?: boolean; dashboard?: DashboardResult }
const messages = ref<Message[]>([])
const input = ref('')
const prompt = ref<HTMLTextAreaElement>()
const suggestionOpen = ref(false)
let suppressSuggestionFocus = false
const mode = ref<Mode>('local')
const modeOptions: { value: Mode; label: string }[] = [{ value: 'local', label: '本地模式' }, { value: 'model', label: '大模型模式' }]
const modeOpen = ref(false)
const modeButton = ref<HTMLButtonElement>()
function closeMode(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) modeOpen.value = false
}
function selectMode(value: Mode) { if (busy.value) return; mode.value = value; modeOpen.value = false; modeButton.value?.focus() }
function escapeMode() { modeOpen.value = false; modeButton.value?.focus() }
const current = ref<DashboardSchema>()
const inputSuggestions = computed(() => getInputSuggestions(input.value, current.value))
const list = ref<HTMLElement>()
const examples = schemaExamples.map(example => example.instruction)
const stage = ref('')
const busy = ref(false)
const shortExamples = ['分析 A 公司股价与成交量', '查看 B 公司股价走势', '找出 A 公司最大涨幅', '看看 B 公司成交量', '对比 A、B 公司走势', '均线、涨跌分布与量价关系']
const exampleDescriptions = ['近 30 个交易日 · 跌幅排名', '近 10 个交易日 · 最高与最低', '近 20 个交易日 · 每日涨跌幅', '近 15 个交易日 · 成交量排名', '近 30 个交易日 · 区间涨跌幅', '5 日均线 · 环形图 · 散点图']
async function scroll() { await nextTick(); list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }) }
async function send() {
  const text = input.value.trim()
  if (!text || busy.value) return
  suggestionOpen.value = false
  const messageMode = mode.value
  messages.value.push({ role: 'user', content: text, mode: messageMode }); input.value = ''
  {
    busy.value = true
    try {
      const outcome = await runAnalysis(text, messageMode, current.value, async nextStage => { stage.value = nextStage; await nextTick() })
      stage.value = '渲染图表'
      current.value = outcome.dashboard.schema
      messages.value.push({ role: 'assistant', content: outcome.content, mode: messageMode, offerLocal: messageMode === 'model' && outcome.usedFallback, dashboard: outcome.dashboard })
      await nextTick()
    } catch (e) { messages.value.push({ role: 'assistant', content: `${e instanceof Error ? e.message : '处理失败，请调整需求后重试。'}${current.value ? ' 已保留之前的看板。' : ''}`, mode: messageMode, error: true, offerLocal: messageMode === 'model' }) }
    finally { busy.value = false; stage.value = '' }
  }
  await scroll()
}
function choose(i: number) { input.value = examples[i]; suggestionOpen.value = false }
function reset() { messages.value = []; current.value = undefined; input.value = ''; suggestionOpen.value = false }
function focusPrompt() {
  modeOpen.value = false
  if (suppressSuggestionFocus) { suppressSuggestionFocus = false; return }
  suggestionOpen.value = true
}
function closeSuggestions(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) suggestionOpen.value = false
}
function selectSuggestion(suggestion: InputSuggestion) {
  input.value = suggestion.text
  suggestionOpen.value = false
  suppressSuggestionFocus = true
  nextTick(() => { prompt.value?.focus(); suppressSuggestionFocus = false })
}
function dismissSuggestions() {
  suggestionOpen.value = false
  suppressSuggestionFocus = true
  nextTick(() => { prompt.value?.focus(); suppressSuggestionFocus = false })
}
function onPromptKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && suggestionOpen.value) { event.preventDefault(); suggestionOpen.value = false; return }
  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault(); void send()
  }
}
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">▥</div><div><strong>问数</strong><small>WENSHU / STOCK INSIGHTS</small></div></div>
      <button class="new-chat" :disabled="busy" @click="reset"><span>＋</span> 新建对话 </button>
      <div class="side-label">工作空间</div>
      <div class="nav-active"><span>◫</span> 数据分析 <span class="nav-dot"></span></div>
      <div class="side-bottom"><div class="side-icon">✳</div><div><strong>{{ mode === 'local' ? '本地演示环境' : '大模型环境' }}</strong><small>{{ mode === 'local' ? '模拟数据 · 无需联网' : '模拟数据 · 需要联网' }}</small></div></div>
    </aside>
    <main class="main">
      <header class="topbar"><div class="breadcrumb">工作空间 <span>/</span> <strong>数据分析</strong></div><div class="top-right">{{ mode === 'local' ? '本地环境' : '大模型环境' }} <span class="divider"></span><span class="avatar">数</span></div></header>
      <div ref="list" class="content-scroll">
        <div class="content">
          <section v-if="!messages.length" class="welcome">
            <div class="eyebrow"><span></span> YOUR STOCK ANALYSIS ASSISTANT</div>
            <h1>你好，今天想<span>了解什么？</span></h1>
            <p class="intro">用自然语言提问，轻松探索股票数据。<br>从一个问题开始，发现数据背后的变化。</p>
            <div class="suggestion-heading"><span>试试这样问</span><small>选择一个示例开始</small></div>
            <div class="suggestions"><button v-for="(item, i) in shortExamples" :key="item" @click="choose(i)"><span class="suggest-icon">{{ ['↗','⌁','✳','▥','⇄','◉'][i] }}</span><span>{{ item }}<small>{{ exampleDescriptions[i] }}</small></span><span class="arrow">↗</span></button></div>
          </section>
          <section v-else class="conversation"><div class="conversation-title"><div><div class="eyebrow"><span></span> ANALYSIS CONVERSATION</div><h2>数据分析对话</h2></div><button class="clear" :disabled="busy" @click="reset">＋ 新建对话</button></div><div v-for="(message, i) in messages" :key="i" class="message" :class="message.role"><div class="message-avatar">{{ message.role === 'user' ? '我' : '▥' }}</div><div class="message-body"><div class="message-label">{{ message.role === 'user' ? '你' : '问数助手' }} <span>· {{ message.mode === 'local' ? '本地模式' : '大模型模式' }}{{ message.error ? ' · 提示' : '' }}</span></div><div class="bubble" :class="{error:message.error}">{{ message.content }}<button v-if="message.offerLocal && mode !== 'local'" class="local-fallback" type="button" :disabled="busy" @click="selectMode('local')">切换本地模式</button></div><AnalysisDashboard v-if="message.dashboard" :result="message.dashboard" /></div></div><p v-if="stage" class="processing" role="status"><span class="processing-text">{{ stage }}</span><span class="processing-dots" aria-hidden="true"><span></span><span></span><span></span></span></p></section>
        </div>
      </div>
      <div class="composer-wrap">
        <form class="composer" @submit.prevent="send" @focusout="closeSuggestions">
          <label class="sr-only" for="prompt">输入分析需求</label>
          <textarea id="prompt" ref="prompt" v-model="input" rows="2" :aria-describedby="suggestionOpen && inputSuggestions.length ? 'recommendation-help' : undefined" placeholder="输入你的问题，例如：分析 A 公司最近 30 个交易日的股价..." @focus="focusPrompt" @input="suggestionOpen = true" @keydown="onPromptKeydown"></textarea>
          <span v-if="suggestionOpen && inputSuggestions.length" id="recommendation-help" class="sr-only">输入推荐已显示，可按 Tab 选择，按 Escape 关闭。</span>
          <section v-if="suggestionOpen && inputSuggestions.length && !busy" id="input-recommendations" class="input-recommendations" aria-label="输入推荐" @keydown.esc.stop="dismissSuggestions">
            <div class="recommendation-heading"><div><strong>输入推荐</strong><span>选择后填入，可继续编辑</span></div><button class="recommendation-close" type="button" aria-label="关闭输入推荐" @click="dismissSuggestions">×</button></div>
            <div class="recommendation-list">
              <button v-for="suggestion in inputSuggestions" :key="suggestion.text" class="recommendation-item" type="button" @click="selectSuggestion(suggestion)">
                <span class="recommendation-icon" aria-hidden="true">{{ suggestion.kind === '追问' ? '↳' : '↗' }}</span>
                <span class="recommendation-copy"><strong>{{ suggestion.label }}</strong><small>{{ suggestion.text }}</small></span>
                <span class="recommendation-kind">{{ suggestion.kind }}</span>
              </button>
            </div>
          </section>
          <div class="composer-bottom"><div class="mode" @focusout="closeMode" @keydown.esc.stop="escapeMode"><button ref="modeButton" class="mode-trigger" type="button" :disabled="busy" :aria-expanded="modeOpen" aria-controls="mode-menu" @focus="suggestionOpen = false" @click="modeOpen = !modeOpen"><span class="mode-dot"></span><span>{{ mode === 'local' ? '本地模式' : '大模型模式' }}</span><span class="chevron" aria-hidden="true">⌄</span></button><div v-if="modeOpen" id="mode-menu" class="mode-menu" aria-label="选择分析模式"><button v-for="option in modeOptions" :key="option.value" type="button" :class="{ selected: mode === option.value }" :aria-pressed="mode === option.value" @click="selectMode(option.value)">{{ option.label }}<span v-if="mode === option.value" aria-hidden="true">✓</span></button></div></div><div class="send-group"><span>Enter 发送 · Shift + Enter 换行</span><button class="send" :disabled="!input.trim() || busy" aria-label="发送消息" @focus="suggestionOpen = false">↑</button></div></div>
        </form>
        <div class="disclaimer">内容基于模拟数据生成，仅供功能演示，不构成投资建议。</div>
      </div>
    </main>
  </div>
</template>

