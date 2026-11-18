<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { AnalysisResult, ChartData } from '../types/analysis'
import { chartColors, changeColor, highlightedChangeColor } from '../chartColors'

const props = defineProps<{ chart: ChartData; analyses: AnalysisResult[] }>()
echarts.use([LineChart, BarChart, PieChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])
const element = ref<HTMLElement>()
let instance: echarts.ECharts | undefined
let observer: ResizeObserver | undefined

function render() {
  if (!instance) return
  const { chart } = props
  if (chart.spec.type === 'donut') {
    instance.setOption({
      color: ['#D94A4A', '#16865E', '#7B8794'],
      tooltip: { trigger: 'item', formatter: '{a}<br/>{b}：{c} 天（{d}%）' },
      legend: { bottom: 0, data: ['上涨', '下跌', '持平'] },
      series: chart.series.map((series, index) => ({
        name: `${series.stock} 公司`, type: 'pie', radius: ['38%', '62%'], center: [`${(index + .5) * 100 / chart.series.length}%`, '45%'],
        label: { show: false }, showEmptyCircle: false,
        data: [{ name: '上涨', value: series.distribution?.rise ?? 0 }, { name: '下跌', value: series.distribution?.fall ?? 0 }, { name: '持平', value: series.distribution?.flat ?? 0 }],
      })),
    }, { notMerge: true })
    return
  }
  if (chart.spec.type === 'scatter') {
    instance.setOption({
      color: chartColors.stocks,
      tooltip: { trigger: 'item', formatter: (param: { seriesName: string; value: [number, number, string] }) => `${param.seriesName}<br/>${param.value[2]}<br/>成交量：${param.value[0].toFixed(2)} 万股<br/>每日涨跌幅：${param.value[1].toFixed(2)}%` },
      legend: { show: chart.series.length > 1, top: 2 },
      grid: { top: 45, right: 26, bottom: 55, left: 70 },
      xAxis: { type: 'value', name: '万股', nameLocation: 'middle', nameGap: 30, scale: true },
      yAxis: { type: 'value', name: '%', scale: true },
      series: chart.series.map(series => ({ name: `${series.stock} 公司`, type: 'scatter', symbolSize: 9, data: (series.scatter ?? []).map(point => [point.volume, point.change, point.date]) })),
    }, { notMerge: true })
    return
  }
  instance.setOption({
    color: chartColors.stocks,
    tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => value == null ? '无数据' : `${Number(value).toFixed(2)} ${chart.spec.unit}` },
    legend: { show: chart.series.length > 1 || chart.series.some(series => series.ma5), top: 2, textStyle: { color: '#536175' } },
    grid: { top: chart.series.length > 1 || chart.series.some(series => series.ma5) ? 45 : 24, right: 24, bottom: 46, left: 62 },
    xAxis: { type: 'category', data: chart.dates, boundaryGap: chart.spec.type === 'bar', axisLabel: { color: '#768398', hideOverlap: true }, axisLine: { lineStyle: { color: '#d9e1ed' } } },
    yAxis: { type: 'value', name: chart.spec.unit, scale: chart.spec.metric === 'price' || chart.spec.metric === 'relativePrice', nameTextStyle: { color: '#768398' }, axisLabel: { color: '#768398' }, splitLine: { lineStyle: { color: '#edf1f6' } } },
    series: chart.series.flatMap((series, seriesIndex) => {
      const relevant = props.analyses
        .filter(item => item.stock === series.stock && (
          (item.spec.type === 'highestVolume' && chart.spec.metric === 'volume') ||
          (item.spec.type === 'priceExtrema' && (chart.spec.metric === 'price' || chart.spec.metric === 'relativePrice')) ||
          ((item.spec.type === 'largestGain' || item.spec.type === 'largestDeclines') &&
            (chart.spec.metric === 'dailyChange' || chart.spec.metric === 'price' || chart.spec.metric === 'relativePrice'))
        ))
      const highlightedDates = new Set(relevant.flatMap(item => item.points.map(point => point.date)))
      const changeByDate = new Map(relevant
        .filter(item => item.spec.type === 'largestGain' || item.spec.type === 'largestDeclines')
        .flatMap(item => item.points.map(point => [point.date, point.value] as const)))
      if ((chart.spec.metric === 'price' || chart.spec.metric === 'relativePrice') &&
          props.analyses.some(item => item.stock === series.stock && item.spec.type === 'periodChange' && item.periodChange != null)) {
        const availableDates = chart.dates.filter((_, index) => series.values[index] != null)
        if (availableDates.length) {
          highlightedDates.add(availableDates[0])
          highlightedDates.add(availableDates[availableDates.length - 1])
        }
      }
      const data = series.values.map((value, index) => {
        if (value == null) return value
        const date = chart.dates[index]
        const highlighted = highlightedDates.has(date)
        const change = chart.spec.metric === 'dailyChange' ? value : changeByDate.get(date)
        if (!highlighted && change == null) return value
        return { value, itemStyle: {
          ...(highlighted ? { color: change != null ? highlightedChangeColor(change) : chartColors.stocksHighlighted[seriesIndex % chartColors.stocksHighlighted.length] }
            : change != null ? { color: changeColor(change) } : {}),
          ...(highlighted ? { borderColor: chartColors.highlightBorder, borderWidth: 2 } : {}),
        }, ...(highlighted && chart.spec.type === 'line' ? { symbolSize: 10 } : {}) }
      })
      const main = { name: `${series.stock} 公司收盘价`, type: chart.spec.type, data, connectNulls: false,
        symbol: 'circle', symbolSize: 5, barMaxWidth: 22 }
      return series.ma5 ? [main, { name: `${series.stock} 公司 5 日均线`, type: 'line', data: series.ma5, connectNulls: false, showSymbol: false, itemStyle: { color: seriesIndex ? '#8363B5' : '#D59031' }, lineStyle: { type: 'dashed', width: 2, color: seriesIndex ? '#8363B5' : '#D59031' } }] : [{ ...main, name: `${series.stock} 公司` }]
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
  <div ref="element" class="chart-canvas" role="img" :aria-label="`${chart.spec.title}，${{ line: '折线图', bar: '柱状图', donut: '环形图', scatter: '散点图' }[chart.spec.type]}，单位${chart.spec.unit}`"></div>
</template>
