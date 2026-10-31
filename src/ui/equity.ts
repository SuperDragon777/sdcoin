import { GameState } from '../engine/types'
import { equityOf } from '../engine/game'
import { TPD } from '../engine/constants'

export type Period = '1d' | '7d' | '30d' | 'all'
export const PERIODS: { v: Period; l: string }[] = [
	{ v: '1d', l: '1 день' },
	{ v: '7d', l: '7 дней' },
	{ v: '30d', l: '30 дней' },
	{ v: 'all', l: 'Всё время' }
]
const SPAN: Record<Period, number> = {
	'1d': TPD,
	'7d': 7 * TPD,
	'30d': 30 * TPD,
	all: Infinity
}

export function equityPeriod(
	g: GameState,
	p: Period
): { points: [number, number][]; change: number; pct: number } {
	const cutoff = g.tick - SPAN[p]
	const now = equityOf(g)
	const pts = g.equity.filter(e => e[0] >= cutoff)
	let base = pts.length ? pts[0][1] : now
	if (pts.length && pts[0][0] > cutoff) {
		const before = g.equity.filter(e => e[0] < cutoff)
		if (before.length) {
			base = before[before.length - 1][1]
			pts.unshift(before[before.length - 1])
		}
	}
	const points: [number, number][] = [...pts]
	if (!points.length || points[points.length - 1][0] !== g.tick)
		points.push([g.tick, now])
	else points[points.length - 1] = [g.tick, now]
	return { points, change: now - base, pct: base > 0 ? now / base - 1 : 0 }
}
