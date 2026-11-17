<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { answer, parseQuery, type Query } from './local'

type Message = { role: 'user' | 'assistant'; content: string; error?: boolean }
const messages = ref<Message[]>([])
const input = ref('')
const mode = ref('local')
const current = ref<Query>()
const list = ref<HTMLElement>()
const examples = [
  '分析 A 公司最近 30 个交易日的股价和成交量，并标出跌幅最大的 3 个交易日。',
  '查看 B 公司最近 10 个交易日的股价走势，并标出区间内的最高价和最低价。',
  '展示 A 公司最近 20 个交易日的每日涨跌幅，并找出涨幅最大的交易日。',
  '用柱状图展示 B 公司最近 15 个交易日的成交量，并列出成交量最高的 3 个交易日。',
  '对比 A 公司和 B 公司最近 30 个交易日的股价走势，并展示两家公司在这段时间内的涨跌幅。'
]
const shortExamples = ['分析 A 公司股价与成交量', '查看 B 公司股价走势', '找出 A 公司最大涨幅', '看看 B 公司成交量', '对比 A、B 公司走势']
async function scroll() { await nextTick(); list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }) }
async function send() {
  const text = input.value.trim()
  if (!text) return
  messages.value.push({ role: 'user', content: text }); input.value = ''
  if (mode.value === 'model') messages.value.push({ role: 'assistant', content: '大模型模式将在后续阶段接入。目前请选择左下角的「本地模式」继续体验。', error: true })
  else {
    try { const query = parseQuery(text, current.value); const result = answer(query); current.value = query; messages.value.push({ role: 'assistant', content: result }) }
    catch (e) { messages.value.push({ role: 'assistant', content: e instanceof Error ? e.message : '处理失败，请换一种说法再试。', error: true }) }
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
      <button class="new-chat" @click="reset"><span>＋</span> 新建对话 </button>
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
          <section v-else class="conversation" aria-live="polite"><div class="conversation-title"><div><div class="eyebrow"><span></span> ANALYSIS CONVERSATION</div><h2>数据分析对话</h2></div><button class="clear" @click="reset">＋ 新建对话</button></div><div v-for="(message, i) in messages" :key="i" class="message" :class="message.role"><div class="message-avatar">{{ message.role === 'user' ? '我' : '▥' }}</div><div class="message-body"><div class="message-label">{{ message.role === 'user' ? '你' : '问数助手' }} <span v-if="message.role === 'assistant'">· {{ message.error ? '提示' : '本地分析' }}</span></div><div class="bubble" :class="{error:message.error}">{{ message.content }}</div></div></div></section>
        </div>
      </div>
      <div class="composer-wrap"><form class="composer" @submit.prevent="send"><label class="sr-only" for="prompt">输入分析需求</label><textarea id="prompt" v-model="input" rows="2" placeholder="输入你的问题，例如：分析 A 公司最近 30 个交易日的股价..." @keydown.enter.exact.prevent="send"></textarea><div class="composer-bottom"><label class="mode"><span class="mode-dot"></span><select v-model="mode" aria-label="选择分析模式"><option value="local">本地模式</option><option value="model">大模型模式</option></select><span class="chevron">⌄</span></label><div class="send-group"><span>Enter 发送 · Shift + Enter 换行</span><button class="send" :disabled="!input.trim()" aria-label="发送消息">↑</button></div></div></form><div class="disclaimer">内容基于模拟数据生成，仅供功能演示，不构成投资建议。</div></div>
    </main>
  </div>
</template>

