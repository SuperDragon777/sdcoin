import { Bar, GameState } from '../engine/types'
import { BAR_TICKS, TPD } from '../engine/constants'
import { round2 } from '../engine/prng'
import { PHASES } from '../engine/schedule'

export function barIndexAt(bars: Bar[], tick: number): number {
	let lo = 0
	let hi = bars.length - 1
	if (hi < 0) return -1
	while (lo < hi) {
		const m = (lo + hi + 1) >> 1
		if (bars[m][0] <= tick) lo = m
		else hi = m - 1
	}
	return lo
}

export function priceAgo(g: GameState, id: string, ticks: number): number {
	const b = g.markets[id].bars
	const target = g.tick - ticks
	if (target <= b[0][0]) return b[0][1]
	return b[barIndexAt(b, target)][4]
}

export function changeOver(g: GameState, id: string, ticks: number): number {
	const cs = g.markets[id]
	const a = priceAgo(g, id, ticks)
	return a > 0 ? round2(cs.price) / a - 1 : 0
}

export function volume24(g: GameState, id: string): number {
	const b = g.markets[id].bars
	let v = 0
	for (let i = b.length - 1; i >= 0 && b[i][0] > g.tick - TPD; i--) v += b[i][5]
	return v
}

export function closes(g: GameState, id: string, n: number): number[] {
	const b = g.markets[id].bars
	return b.slice(Math.max(0, b.length - n)).map(x => x[4])
}

function ema(values: number[], period: number): number {
	const k = 2 / (period + 1)
	let e = values[0]
	for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k)
	return e
}

export interface Trend {
	dir: 'up' | 'down' | 'flat'
	label: string
}

export function trendOf(g: GameState, id: string): Trend {
	const c = closes(g, id, 160)
	if (c.length < 20) return { dir: 'flat', label: 'Недостаточно данных' }
	const fast = ema(c, 12)
	const slow = ema(c, 48)
	const d = fast / slow - 1
	if (d > 0.004) return { dir: 'up', label: 'Восходящий' }
	if (d < -0.004) return { dir: 'down', label: 'Нисходящий' }
	return { dir: 'flat', label: 'Боковой' }
}

export function rsi14(g: GameState, id: string): number | null {
	const c = closes(g, id, 60)
	if (c.length < 16) return null
	let gain = 0
	let loss = 0
	for (let i = 1; i <= 14; i++) {
		const d = c[i] - c[i - 1]
		if (d >= 0) gain += d
		else loss -= d
	}
	gain /= 14
	loss /= 14
	for (let i = 15; i < c.length; i++) {
		const d = c[i] - c[i - 1]
		gain = (gain * 13 + Math.max(0, d)) / 14
		loss = (loss * 13 + Math.max(0, -d)) / 14
	}
	if (loss === 0) return 100
	return 100 - 100 / (1 + gain / loss)
}

export function realizedVol(g: GameState, id: string): number {
	const c = closes(g, id, 49)
	if (c.length < 10) return 1
	const r: number[] = []
	for (let i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]))
	const m = r.reduce((a, b) => a + b, 0) / r.length
	const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) * (b - m), 0) / r.length)
	const coin = g.coins.find(x => x.id === id)
	const expected = (coin ? coin.volatility : 0.05) / Math.sqrt(TPD / BAR_TICKS)
	return sd / expected
}

export interface MarketState {
	dir: 'up' | 'down' | 'flat'
	label: string
	volLabel: string
	avg24: number
}

export function marketState(g: GameState): MarketState {
	if (g.coins.length === 0)
		return { dir: 'flat', label: 'Нет монет', volLabel: '—', avg24: 0 }
	let sum = 0
	let vol = 0
	for (const c of g.coins) {
		sum += changeOver(g, c.id, TPD)
		vol += realizedVol(g, c.id)
	}
	const avg = sum / g.coins.length
	const v = vol / g.coins.length
	return {
		dir: avg > 0.012 ? 'up' : avg < -0.012 ? 'down' : 'flat',
		label:
			avg > 0.012
				? 'Рынок растёт'
				: avg < -0.012
					? 'Рынок снижается'
					: 'Боковое движение',
		volLabel: v < 0.8 ? 'Низкая' : v < 1.3 ? 'Умеренная' : 'Высокая',
		avg24: avg
	}
}

export const phaseLabel = (g: GameState, phase: keyof typeof PHASES): string =>
	PHASES[phase].label
