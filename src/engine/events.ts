import {
	Coin,
	GameEvent,
	GameState,
	Importance,
	Sentiment,
	Shape
} from './types'
import { Rng, clamp, stream } from './prng'
import { MAX_EVENT_DAYS, TPD } from './constants'
import { segmentsUpTo } from './schedule'
import {
	CLOSERS,
	LEAD_LINES,
	ORGS,
	PLACES,
	REGS,
	TEMPLATES,
	Tpl
} from './templates'
import { fmtDM } from './time'

type EventCtx = Pick<GameState, 'seed' | 'coins' | 'settings'>

const SIGMA_REF = 0.055
const DUR_DAYS: Record<Shape, [number, number]> = {
	shock: [0.3, 1.5],
	spike: [0.5, 2],
	ramp: [2, 8],
	sustained: [3, 12]
}
const JUMP_FRAC: Record<Shape, number> = {
	shock: 0.55,
	spike: 0.7,
	ramp: 0.08,
	sustained: 0.15
}

const cache = new Map<string, GameEvent[]>()
const sigCache = new WeakMap<Coin[], string>()

function coinSig(coins: Coin[]): string {
	let s = sigCache.get(coins)
	if (s === undefined) {
		s = coins
			.map(c => `${c.id}:${c.createdTick}:${c.volatility}:${c.beta}`)
			.join(',')
		sigCache.set(coins, s)
	}
	return s
}

function fill(s: string, v: Record<string, string>): string {
	return s.replace(/\{(\w+)\}/g, (_m, k: string) => v[k] ?? '')
}

function level(maxAbs: number): Importance {
	return maxAbs < 0.05 ? 1 : maxAbs < 0.14 ? 2 : 3
}

function noise(seed: string, evId: string, coinId: string): number {
	return stream(seed, `n:${evId}:${coinId}`).next()
}

function pickTpl(r: Rng, list: Tpl[]): Tpl {
	return list[r.weighted(list.map(t => t.w))]
}

function buildEvent(
	seed: string,
	id: string,
	tpl: Tpl,
	startTick: number,
	r: Rng,
	coins: Coin[],
	primary: Coin | null,
	boost: number
): GameEvent {
	const neutral = tpl.sign === 0
	const s = neutral
		? 0.06 + 0.1 * r.next()
		: 0.08 + 0.92 * Math.pow(r.next(), 2.4)
	const mag =
		(neutral ? 0.004 + 0.01 * r.next() : 0.02 + 0.2 * Math.pow(s, 1.2)) * boost
	const shape = r.pick(tpl.shapes)
	const dd = DUR_DAYS[shape]
	const duration = Math.min(
		MAX_EVENT_DAYS * TPD,
		Math.round(r.range(dd[0], dd[1]) * TPD)
	)
	const lead = r.next() < tpl.lead ? r.int(8, 120) : 0
	const newsTick = Math.max(0, startTick - lead)
	const impacts: Record<string, number> = {}
	if (tpl.scope === 'coin' && primary) {
		const k = clamp(primary.volatility / SIGMA_REF, 0.5, 2)
		const dir = neutral ? (r.next() < 0.5 ? -1 : 1) : tpl.sign
		impacts[primary.id] = dir * mag * k * (0.85 + 0.3 * r.next())
		if (coins.length > 1 && r.next() < 0.18) {
			const others = coins.filter(c => c.id !== primary.id)
			const o = r.pick(others)
			impacts[o.id] = impacts[primary.id] * 0.3 * (r.next() < 0.5 ? -1 : 1)
		}
	} else {
		for (const c of coins) {
			if (neutral) impacts[c.id] = (noise(seed, id + 's', c.id) - 0.5) * 0.02
			else
				impacts[c.id] =
					tpl.sign * mag * 0.8 * c.beta * (0.8 + 0.4 * noise(seed, id, c.id))
		}
	}
	for (const k of Object.keys(impacts))
		impacts[k] = clamp(impacts[k], -0.6, 1.5)
	const org = r.pick(ORGS)
	const place = r.pick(PLACES)
	const vars: Record<string, string> = {
		coin: primary ? primary.name : 'цифровые активы',
		t: primary ? primary.ticker : '',
		org,
		pl: place.p,
		plg: place.g,
		reg: r.pick(REGS),
		n: String(r.int(12, 95) * 10),
		m: String(r.int(3, 90)),
		pct: String(r.int(4, 35)),
		rate: (r.int(35, 125) / 10).toFixed(1).replace('.', ','),
		dt: fmtDM(startTick)
	}
	const sentiment: Sentiment =
		tpl.sign > 0 ? 'pos' : tpl.sign < 0 ? 'neg' : 'neu'
	const maxAbs = Math.max(...Object.values(impacts).map(Math.abs))
	const head = fill(r.pick(tpl.heads), vars)
	let body = fill(r.pick(tpl.bodies), vars) + ' ' + r.pick(CLOSERS[sentiment])
	if (lead > 0) body += ' ' + fill(r.pick(LEAD_LINES), vars)
	return {
		id,
		source: 'generated',
		scope: tpl.scope,
		tpl: tpl.id,
		startTick,
		newsTick,
		duration,
		shape,
		strength: s,
		impacts,
		headline: head,
		body,
		importance: neutral ? 1 : level(maxAbs),
		sentiment
	}
}

const MACRO = TEMPLATES.filter(t => t.scope === 'macro')
const COINT = TEMPLATES.filter(t => t.scope === 'coin')

export function eventsForDay(g: EventCtx, day: number): GameEvent[] {
	const dens = g.settings.eventDensity
	const key = `${g.seed}|${coinSig(g.coins)}|${dens}|${day}`
	const hit = cache.get(key)
	if (hit) return hit
	const out: GameEvent[] = []
	const dayStart = day * TPD
	const rm = stream(g.seed, `macro:${day}`)
	const nm =
		(rm.next() < 0.3 * dens ? 1 : 0) + (rm.next() < 0.08 * dens ? 1 : 0)
	for (let i = 0; i < nm; i++) {
		const tpl = pickTpl(rm, MACRO)
		const st = dayStart + rm.int(0, TPD - 1)
		out.push(buildEvent(g.seed, `g${day}m${i}`, tpl, st, rm, g.coins, null, 1))
	}
	for (const c of g.coins) {
		if (dayStart + TPD <= c.createdTick) continue
		const rc = stream(g.seed, `coin:${c.id}:${day}`)
		const nc =
			(rc.next() < 0.5 * dens ? 1 : 0) + (rc.next() < 0.12 * dens ? 1 : 0)
		for (let i = 0; i < nc; i++) {
			const tpl = pickTpl(rc, COINT)
			const st = dayStart + rc.int(0, TPD - 1)
			const ev = buildEvent(
				g.seed,
				`g${day}c${c.id}${i}`,
				tpl,
				st,
				rc,
				g.coins,
				c,
				1
			)
			if (st >= c.createdTick) out.push(ev)
		}
	}
	const segs = segmentsUpTo(g.seed, dayStart + TPD)
	for (const seg of segs) {
		if (seg.start > 0 && seg.start >= dayStart && seg.start < dayStart + TPD) {
			const rp = stream(g.seed, `phase:${seg.start}`)
			const list = MACRO.filter(t => t.phases && t.phases.includes(seg.phase))
			if (list.length) {
				const tpl = pickTpl(rp, list)
				out.push(
					buildEvent(
						g.seed,
						`g${day}p${seg.start}`,
						tpl,
						seg.start,
						rp,
						g.coins,
						null,
						1.35
					)
				)
			}
		}
	}
	out.sort((a, b) => a.startTick - b.startTick || (a.id < b.id ? -1 : 1))
	if (cache.size > 6000) cache.clear()
	cache.set(key, out)
	return out
}

export function isSuppressed(g: GameState, id: string): boolean {
	return g.suppressed.includes(id)
}

export function eventsOverlapping(
	g: GameState,
	a: number,
	b: number
): GameEvent[] {
	const out: GameEvent[] = []
	const d0 = Math.max(0, Math.floor(a / TPD) - MAX_EVENT_DAYS)
	const d1 = Math.floor(b / TPD)
	for (let d = d0; d <= d1; d++) {
		for (const ev of eventsForDay(g, d)) {
			if (
				ev.startTick <= b &&
				ev.startTick + ev.duration >= a &&
				!isSuppressed(g, ev.id)
			)
				out.push(ev)
		}
	}
	for (const ev of g.customEvents) {
		if (ev.startTick <= b && ev.startTick + ev.duration >= a) out.push(ev)
	}
	return out
}

export function activeEvents(g: GameState, t: number): GameEvent[] {
	const out: GameEvent[] = []
	const day = Math.floor(t / TPD)
	for (let d = Math.max(0, day - MAX_EVENT_DAYS); d <= day; d++) {
		for (const ev of eventsForDay(g, d)) {
			if (
				ev.startTick <= t &&
				t <= ev.startTick + ev.duration &&
				!isSuppressed(g, ev.id)
			)
				out.push(ev)
		}
	}
	for (const ev of g.customEvents) {
		if (ev.startTick <= t && t <= ev.startTick + ev.duration) out.push(ev)
	}
	return out
}

export function eventsStartingBetween(
	g: GameState,
	a: number,
	b: number
): GameEvent[] {
	const out: GameEvent[] = []
	for (
		let d = Math.max(0, Math.floor(a / TPD));
		d <= Math.floor(b / TPD);
		d++
	) {
		for (const ev of eventsForDay(g, d)) {
			if (ev.startTick >= a && ev.startTick <= b && !isSuppressed(g, ev.id))
				out.push(ev)
		}
	}
	for (const ev of g.customEvents) {
		if (ev.startTick >= a && ev.startTick <= b) out.push(ev)
	}
	return out.sort((x, y) => x.startTick - y.startTick)
}

export interface EventEffect {
	jump: number
	drift: number
	vol: number
}

const ZERO: EventEffect = { jump: 0, drift: 0, vol: 0 }

export function eventEffect(
	ev: GameEvent,
	coinId: string,
	t: number,
	mood: number
): EventEffect {
	const imp = ev.impacts[coinId]
	if (imp === undefined || t < ev.startTick || t > ev.startTick + ev.duration)
		return ZERO
	const L = Math.log(1 + imp)
	const sign = Math.sign(L)
	const amp = (1 + 0.9 * Math.abs(L)) * (1 + 0.25 * mood * sign)
	const jf = JUMP_FRAC[ev.shape]
	const dur = Math.max(1, ev.duration)
	const tau = (t - ev.startTick) / dur
	if (t === ev.startTick) {
		return { jump: L * jf * amp, drift: 0, vol: Math.abs(L) * 2.5 }
	}
	let w = 1
	if (ev.shape === 'shock') w = 2 * (1 - tau)
	else if (ev.shape === 'ramp') w = 6 * tau * (1 - tau)
	let drift = (L * (1 - jf) * amp * w) / dur
	if (ev.shape === 'spike') drift -= (0.45 * L * amp) / dur
	return { jump: 0, drift, vol: Math.abs(L) * 2.5 * (1 - tau) }
}
