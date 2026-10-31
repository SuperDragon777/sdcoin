import { Phase } from './types'
import { Rng, stream } from './prng'
import { TPD } from './constants'

export interface PhaseDef {
	mood: number
	vol: number
	dur: [number, number]
	label: string
	next: [Phase, number][]
}

export const PHASES: Record<Phase, PhaseDef> = {
	stagnation: {
		mood: 0,
		vol: 0.85,
		dur: [6, 18],
		label: 'Стагнация',
		next: [
			['expansion', 0.42],
			['correction', 0.2],
			['stagnation', 0.1],
			['recovery', 0.18],
			['euphoria', 0.1]
		]
	},
	expansion: {
		mood: 0.5,
		vol: 0.95,
		dur: [12, 40],
		label: 'Экономический рост',
		next: [
			['euphoria', 0.3],
			['stagnation', 0.3],
			['correction', 0.4]
		]
	},
	euphoria: {
		mood: 1,
		vol: 1.3,
		dur: [5, 15],
		label: 'Ажиотаж',
		next: [
			['correction', 0.6],
			['crisis', 0.25],
			['stagnation', 0.15]
		]
	},
	correction: {
		mood: -0.5,
		vol: 1.2,
		dur: [6, 20],
		label: 'Коррекция',
		next: [
			['recovery', 0.35],
			['stagnation', 0.3],
			['crisis', 0.2],
			['expansion', 0.15]
		]
	},
	crisis: {
		mood: -1,
		vol: 1.8,
		dur: [4, 12],
		label: 'Кризис',
		next: [
			['recovery', 0.8],
			['correction', 0.2]
		]
	},
	recovery: {
		mood: 0.45,
		vol: 1.1,
		dur: [10, 30],
		label: 'Восстановление',
		next: [
			['expansion', 0.6],
			['stagnation', 0.25],
			['euphoria', 0.15]
		]
	}
}

export interface Segment {
	phase: Phase
	start: number
	end: number
}

interface Cached {
	rng: Rng
	segs: Segment[]
}

const cache = new Map<string, Cached>()

function makeSegment(r: Rng, phase: Phase, start: number): Segment {
	const d = PHASES[phase].dur
	return {
		phase,
		start,
		end: start + Math.max(TPD, Math.round(r.range(d[0], d[1]) * TPD))
	}
}

export function segmentsUpTo(seed: string, tick: number): Segment[] {
	let c = cache.get(seed)
	if (!c) {
		const rng = stream(seed, 'cycle')
		const first = rng.pick<Phase>([
			'stagnation',
			'expansion',
			'recovery',
			'stagnation'
		])
		c = { rng, segs: [makeSegment(rng, first, 0)] }
		if (cache.size > 16) cache.clear()
		cache.set(seed, c)
	}
	let last = c.segs[c.segs.length - 1]
	while (last.end <= tick) {
		const def = PHASES[last.phase]
		const idx = c.rng.weighted(def.next.map(n => n[1]))
		last = makeSegment(c.rng, def.next[idx][0], last.end)
		c.segs.push(last)
	}
	return c.segs
}

export function segmentAt(seed: string, tick: number): Segment {
	const s = segmentsUpTo(seed, tick)
	let lo = 0
	let hi = s.length - 1
	while (lo < hi) {
		const m = (lo + hi + 1) >> 1
		if (s[m].start <= tick) lo = m
		else hi = m - 1
	}
	return s[lo]
}
