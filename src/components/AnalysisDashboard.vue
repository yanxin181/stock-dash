<script setup lang="ts">
import type { AnalysisResult, DashboardResult } from '../types/analysis'
import StockChart from './StockChart.vue'

defineProps<{ result: DashboardResult }>()
const name = (item: AnalysisResult) => ({ priceExtrema: '收盘价最高与最低', largestGain: '最大单日涨幅', largestDeclines: '跌幅排名', highestVolume: '成交量排名', periodChange: '区间涨跌幅' })[item.spec.type]
const number = (value: number, unit: string) => `${unit === '%' && value > 0 ? '+' : ''}${value.toFixed(2)}${unit === '%' ? '%' : ` ${unit}`}`
const changeClass = (value: number | null | undefined) => value == null ? '' : value > 0 ? 'change-rise' : value < 0 ? 'change-fall' : 'change-flat'
</script>

<template>
  <section class="dashboard" aria-label="分析看板">
    <div class="dashboard-heading"><div><span class="dashboard-kicker">ANALYSIS RESULT</span><h3>{{ result.schema.title }}</h3></div><span class="data-badge">模拟数据</span></div>
    <p class="data-meta">数据来源：{{ result.schema.dataSource }} <span>·</span> 截止日期：{{ result.schema.dataAsOf }} <span>·</span> 最近 {{ result.schema.timeRange.count }} 个交易日</p>
    <div v-if="result.warnings.length" class="data-warning" role="status"><p v-for="warning in result.warnings" :key="warning">{{ warning }}</p></div>
    <div class="chart-list">
      <section v-for="(chart, index) in result.charts" :key="index" class="chart-card">
        <div class="chart-heading"><div><h4>{{ chart.spec.title }}</h4><p>单位：{{ chart.spec.unit }}<template v-if="chart.spec.metric === 'relativePrice'"> · 各自区间首日 = 100</template></p></div><span>{{ chart.spec.type === 'line' ? '折线图' : '柱状图' }}</span></div>
        <StockChart :chart="chart" :analyses="result.analyses" />
        <p class="chart-key"><template v-if="chart.spec.metric === 'dailyChange'">红色上涨 · 绿色下跌 · 灰色持平 · </template>颜色加深及金色描边表示分析关注点</p>
      </section>
    </div>
    <div v-if="result.analyses.length" class="analysis-grid">
      <section v-for="(item, index) in result.analyses" :key="index" class="analysis-card">
        <h4>{{ item.stock }} 公司 · {{ name(item) }}</h4>
        <template v-if="item.spec.type === 'periodChange'"><p class="period-value" :class="changeClass(item.periodChange)">{{ item.periodChange == null ? '暂无数据' : number(item.periodChange, '%') }}</p></template>
        <template v-else><ol v-if="item.points.length" class="analysis-list"><li v-for="(point, i) in item.points" :key="`${point.date}-${i}`"><span>{{ point.label === 'highest' ? '最高' : point.label === 'lowest' ? '最低' : `0${i + 1}` }} <small>{{ point.date }}</small></span><strong :class="item.unit === '%' ? changeClass(point.value) : ''">{{ number(point.value, item.unit) }}</strong></li></ol><p v-else class="empty-data">无符合条件的数据</p></template>
        <p v-if="item.message" class="analysis-note">{{ item.message }}</p>
      </section>
    </div>
    <div class="conclusion"><strong>分析结论</strong><p v-for="(line, i) in result.conclusions" :key="i">{{ line }}</p></div>
  </section>
</template>
