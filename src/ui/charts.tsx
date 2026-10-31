import { useEffect, useRef } from 'react'
import {
	ColorType,
	CrosshairMode,
	IChartApi,
	ISeriesApi,
	LineStyle,
	UTCTimestamp,
	createChart
} from 'lightweight-charts'
import { useGame } from '../store/store'
import { aggregate, forecast, Candle } from '../engine/market'
import { BAR_TICKS, EPOCH_MS, TICK_MS_GAME } from '../engine/constants'

const T0 = EPOCH_MS / 1000
const STEP = TICK_MS_GAME / 1000
const toTime = (t: number): UTCTimestamp => (T0 + t * STEP) as UTCTimestamp

const baseOptions = {
	autoSize: true,
	layout: {
		background: { type: ColorType.Solid, color: '#151a20' },
		textColor: '#8d97a3',
		fontFamily: '"Segoe UI Variable Text","Segoe UI",Inter,Arial,sans-serif',
		fontSize: 12
	},
	grid: { vertLines: { color: '#1b222a' }, horzLines: { color: '#1b222a' } },
	rightPriceScale: { borderColor: '#242c35' },
	timeScale: {
		borderColor: '#242c35',
		timeVisible: true,
		secondsVisible: false,
		rightOffset: 6
	},
	crosshair: { mode: CrosshairMode.Normal },
	localization: {
		priceFormatter: (p: number) =>
			p.toLocaleString('ru-RU', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			})
	}
}

function sma(c: Candle[], n: number) {
	const out: { time: UTCTimestamp; value: number }[] = []
	let sum = 0
	for (let i = 0; i < c.length; i++) {
		sum += c[i].c
		if (i >= n) sum -= c[i - n].c
		if (i >= n - 1) out.push({ time: toTime(c[i].t), value: sum / n })
	}
	return out
}

function ema(c: Candle[], n: number) {
	const out: { time: UTCTimestamp; value: number }[] = []
	const k = 2 / (n + 1)
	let e = 0
	for (let i = 0; i < c.length; i++) {
		e = i === 0 ? c[i].c : c[i].c * k + e * (1 - k)
		if (i >= n - 1) out.push({ time: toTime(c[i].t), value: e })
	}
	return out
}

interface Refs {
	chart: IChartApi
	candle: ISeriesApi<'Candlestick'>
	vol: ISeriesApi<'Histogram'>
	sma: ISeriesApi<'Line'>
	ema: ISeriesApi<'Line'>
	fm: ISeriesApi<'Line'>
	fh: ISeriesApi<'Line'>
	fl: ISeriesApi<'Line'>
	key: string
	len: number
}

export const FORECAST_STEPS = 40

export function PriceChart(props: {
	coinId: string
	k: number
	showSma: boolean
	showEma: boolean
	showForecast: boolean
}) {
	const g = useGame()
	const host = useRef<HTMLDivElement>(null)
	const ref = useRef<Refs | null>(null)

	useEffect(() => {
		if (!host.current) return
		const chart = createChart(host.current, baseOptions)
		const candle = chart.addCandlestickSeries({
			upColor: '#3fae7c',
			downColor: '#d4605e',
			borderUpColor: '#3fae7c',
			borderDownColor: '#d4605e',
			wickUpColor: '#3fae7c',
			wickDownColor: '#d4605e'
		})
		const vol = chart.addHistogramSeries({
			priceFormat: { type: 'volume' },
			priceScaleId: 'vol',
			lastValueVisible: false,
			priceLineVisible: false
		})
		chart
			.priceScale('vol')
			.applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
		candle
			.priceScale()
			.applyOptions({ scaleMargins: { top: 0.08, bottom: 0.2 } })
		const line = (
			color: string,
			style: LineStyle = LineStyle.Solid,
			width: 1 | 2 = 1
		) =>
			chart.addLineSeries({
				color,
				lineWidth: width,
				lineStyle: style,
				lastValueVisible: false,
				priceLineVisible: false,
				crosshairMarkerVisible: false
			})
		ref.current = {
			chart,
			candle,
			vol,
			sma: line('#d3a24a'),
			ema: line('#9b7fd1'),
			fm: line('#5b9bd5', LineStyle.Dashed, 2),
			fh: line('#3f6c91', LineStyle.Dotted),
			fl: line('#3f6c91', LineStyle.Dotted),
			key: '',
			len: 0
		}
		return () => {
			chart.remove()
			ref.current = null
		}
	}, [])

	useEffect(() => {
		const R = ref.current
		const cs = g.markets[props.coinId]
		if (!R || !cs) return
		const candles = aggregate(cs.bars, props.k)
		const cd = candles.map(c => ({
			time: toTime(c.t),
			open: c.o,
			high: c.h,
			low: c.l,
			close: c.c
		}))
		const vd = candles.map(c => ({
			time: toTime(c.t),
			value: c.v,
			color: c.c >= c.o ? '#3fae7c55' : '#d4605e55'
		}))
		const key = `${props.coinId}|${props.k}|${g.seed}`
		const full = R.key !== key || cd.length < R.len || cd.length - R.len > 1
		if (full) {
			R.candle.setData(cd)
			R.vol.setData(vd)
			R.key = key
			const to = cd.length + (props.showForecast ? FORECAST_STEPS + 2 : 10)
			R.chart
				.timeScale()
				.setVisibleLogicalRange({ from: Math.max(0, cd.length - 100), to })
		} else if (cd.length > 0) {
			try {
				R.candle.update(cd[cd.length - 1])
				R.vol.update(vd[vd.length - 1])
			} catch {
				R.candle.setData(cd)
				R.vol.setData(vd)
			}
		}
		R.len = cd.length
		const tail = candles.slice(-2500)
		R.sma.setData(props.showSma ? sma(tail, 20) : [])
		R.ema.setData(props.showEma ? ema(tail, 50) : [])
		if (props.showForecast && candles.length > 0) {
			const f = forecast(g, props.coinId, FORECAST_STEPS, BAR_TICKS * props.k)
			const last = candles[candles.length - 1]
			if (f) {
				const t0 = last.t
				const mk = (arr: number[]) => [
					{ time: toTime(t0), value: Math.round(cs.price * 100) / 100 },
					...arr.map((v, i) => ({
						time: toTime(t0 + (i + 1) * f.stepTicks),
						value: v
					}))
				]
				R.fm.setData(mk(f.mean))
				R.fh.setData(mk(f.hi))
				R.fl.setData(mk(f.lo))
			}
		} else {
			R.fm.setData([])
			R.fh.setData([])
			R.fl.setData([])
		}
	})

	return (
		<div
			ref={host}
			className="chart-host"
		/>
	)
}

export function EquityChart(props: {
	points: [number, number][]
	small?: boolean
}) {
	const host = useRef<HTMLDivElement>(null)
	const ref = useRef<{ chart: IChartApi; s: ISeriesApi<'Line'> } | null>(null)

	useEffect(() => {
		if (!host.current) return
		const chart = createChart(host.current, baseOptions)
		const s = chart.addLineSeries({
			color: '#5b9bd5',
			lineWidth: 2,
			priceLineVisible: false
		})
		ref.current = { chart, s }
		return () => {
			chart.remove()
			ref.current = null
		}
	}, [])

	useEffect(() => {
		const R = ref.current
		if (!R) return
		const data: { time: UTCTimestamp; value: number }[] = []
		let lastT = -1
		for (const [t, v] of props.points) {
			if (t === lastT) data[data.length - 1].value = v / 100
			else data.push({ time: toTime(t), value: v / 100 })
			lastT = t
		}
		R.s.setData(data)
		R.chart.timeScale().fitContent()
	}, [props.points])

	return (
		<div
			ref={host}
			className={'chart-host' + (props.small ? ' sm' : '')}
		/>
	)
}
