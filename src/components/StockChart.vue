<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, MarkPointComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { AnalysisResult, ChartData } from '../types/analysis'

const props = defineProps<{ chart: ChartData; analyses: AnalysisResult[] }>()
echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkPointComponent, CanvasRenderer])
const element = ref<HTMLElement>()
let instance: echarts.ECharts | undefined
let observer: ResizeObserver | undefined

function render() {
  if (!instance) return
  const { chart } = props
  instance.setOption({
    color: ['#4168e8', '#e99651'],
    tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => value == null ? '无数据' : `${Number(value).toFixed(2)} ${chart.spec.unit}` },
    legend: { show: chart.series.length > 1, top: 2, textStyle: { color: '#536175' } },
    grid: { top: chart.series.length > 1 ? 45 : 24, right: 24, bottom: 46, left: 62 },
    xAxis: { type: 'category', data: chart.dates, boundaryGap: chart.spec.type === 'bar', axisLabel: { color: '#768398', hideOverlap: true }, axisLine: { lineStyle: { color: '#d9e1ed' } } },
    yAxis: { type: 'value', name: chart.spec.unit, scale: chart.spec.metric === 'price' || chart.spec.metric === 'relativePrice', nameTextStyle: { color: '#768398' }, axisLabel: { color: '#768398' }, splitLine: { lineStyle: { color: '#edf1f6' } } },
    series: chart.series.map(series => {
      const markers = props.analyses.filter(item => item.stock === series.stock && (
        (item.spec.type === 'priceExtrema' && chart.spec.metric === 'price') ||
        (item.spec.type === 'largestGain' && chart.spec.metric === 'dailyChange') ||
        (item.spec.type === 'largestDeclines' && chart.spec.metric === 'dailyChange') ||
        (item.spec.type === 'highestVolume' && chart.spec.metric === 'volume')
      )).flatMap(item => item.points.map(point => ({
        name: point.label === 'highest' ? '最高' : point.label === 'lowest' ? '最低' : item.spec.type === 'largestGain' ? '最大涨幅' : item.spec.type === 'largestDeclines' ? '跌幅排名' : '成交量排名',
        coord: [point.date, point.value], value: Number(point.value.toFixed(2)),
      })))
      return { name: `${series.stock} 公司`, type: chart.spec.type, data: series.values, connectNulls: false,
        symbol: 'circle', symbolSize: 5, barMaxWidth: 22,
        markPoint: markers.length ? { symbolSize: 48, label: { formatter: '{b}', fontSize: 10 }, data: markers } : undefined }
    }),
  }, { notMerge: true })
}
onMounted(() => {
  if (!element.value) return
  instance = echarts.init(element.value)
  render()
  observer = new ResizeObserver(() => instance?.resize())
  observer.observe(element.value)
})
watch(() => [props.chart, props.analyses], render, { deep: true })
onBeforeUnmount(() => { observer?.disconnect(); instance?.dispose() })
</script>

<template>
  <div ref="element" class="chart-canvas" role="img" :aria-label="`${chart.spec.title}，${chart.spec.type === 'line' ? '折线图' : '柱状图'}，单位${chart.spec.unit}`"></div>
</template>
