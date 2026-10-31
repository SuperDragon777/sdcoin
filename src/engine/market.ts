import {
	Bar,
	Coin,
	CoinState,
	GameEvent,
	GameState,
	Regime,
	RegimeKind
} from './types'
import { Rng, clamp, round2, stream } from './prng'
import {
	BAR_TICKS,
	JUMP_P,
	MOMENTUM,
	MOOD_DRIFT,
	PULL_K,
	SQRT_TPD,
	TPD
} from './constants'
import { eventEffect, eventsOverlapping } from './events'

interface RegDef {
	d: [number, number]
	v: number
	days: [number, number]
}

const REG: Record<RegimeKind, RegDef> = {
	calm: { d: [-0.002, 0.002], v: 0.6, days: [2, 8] },
	bull: { d: [0.008, 0.022], v: 1, days: [3, 14] },
	bear: { d: [-0.022, -0.008], v: 1.1, days: [3, 12] },
	chop: { d: [-0.002, 0.002], v: 0.95, days: [2, 7] },
	rally: { d: [0.03, 0.06], v: 1.5, days: [0.5, 2.5] },
	crash: { d: [-0.07, -0.03], v: 1.9, days: [0.4, 2] }
}

export const REGIME_LABELS: Record<RegimeKind, string> = {
	calm: 'Штиль',
	bull: 'Восходящий тренд',
	bear: 'Нисходящий тренд',
	chop: 'Боковое движение',
	rally: 'Резкий рост',
	crash: 'Резкое падение'
}

const KINDS: RegimeKind[] = ['calm', 'bull', 'bear', 'chop', 'rally', 'crash']

export function makeRegime(
	r: Rng,
	kind: RegimeKind,
	c: Coin,
	days?: number
): Regime {
	const def = REG[kind]
	const scale = Math.pow(c.volatility / 0.05, 0.7)
	const dayDrift = r.range(def.d[0], def.d[1]) * scale
	const left =
		days !== undefined
			? Math.round(days * TPD)
			: Math.round(r.range(def.days[0], def.days[1]) * TPD)
	return { kind, drift: dayDrift / TPD, vol: def.v, left: Math.max(1, left) }
}

export function pickRegime(
	r: Rng,
	mood: number,
	prev: RegimeKind,
	c: Coin
): Regime {
	const w = [0.2, 0.22, 0.2, 0.2, 0.09, 0.09]
	w[1] *= Math.max(0.2, 1 + mood * 0.9)
	w[2] *= Math.max(0.2, 1 - mood * 0.9)
	w[4] *= 1 + Math.max(0, mood) * 1.2
	w[5] *= 1 + Math.max(0, -mood) * 1.5
	if (prev === 'crash') {
		w[1] *= 1.8
		w[3] *= 1.6
		w[5] *= 0.2
	} else if (prev === 'rally') {
		w[2] *= 1.5
		w[3] *= 1.8
		w[4] *= 0.2
	}
	const pi = KINDS.indexOf(prev)
	if (pi >= 0) w[pi] *= 0.4
	const kind = KINDS[r.weighted(w)]
	return makeRegime(r, kind, c)
}

export const lnAnchor = (c: Coin, t: number): number =>
	Math.log(c.startPrice) + (c.drift * Math.max(0, t - c.createdTick)) / TPD

export function pushBar(
	bars: Bar[],
	t: number,
	price: number,
	vol: number
): void {
	const bt = t - (t % BAR_TICKS)
	const last = bars[bars.length - 1]
	if (last && last[0] === bt) {
		if (price > last[2]) last[2] = price
		if (price < last[3]) last[3] = price
		last[4] = price
		last[5] += vol
		return
	}
	const open = last ? last[4] : price
	bars.push([
		bt,
		open,
		Math.max(open, price),
		Math.min(open, price),
		price,
		vol
	])
}

export function initCoinState(g: GameState, c: Coin, t: number): CoinState {
	const r = stream(g.seed, `price:${c.id}`)
	const regime = pickRegime(r, g.mood, 'calm', c)
	const p = round2(c.startPrice)
	const bt = t - (t % BAR_TICKS)
	return {
		price: c.startPrice,
		regime,
		volState: 1,
		prevRet: 0,
		rng: r.snapshot(),
		bars: [[bt, p, p, p, p, 0]]
	}
}

export function stepCoin(
	g: GameState,
	c: Coin,
	cs: CoinState,
	t: number,
	events: GameEvent[],
	record: boolean
): void {
	const r = Rng.from(cs.rng)
	if (cs.regime.left <= 0) cs.regime = pickRegime(r, g.mood, cs.regime.kind, c)
	cs.regime.left -= 1
	let jump = 0
	let drift = 0
	let vadd = 0
	for (const ev of events) {
		const e = eventEffect(ev, c.id, t, g.mood)
		jump += e.jump
		drift += e.drift
		vadd += e.vol
	}
	const sigma0 = c.volatility / SQRT_TPD
	const z = r.normal()
	const sigma =
		sigma0 *
		cs.regime.vol *
		cs.volState *
		g.cycleVol *
		g.settings.marketVolMult *
		(1 + Math.min(vadd, 2.5))
	const pullK = (cs.regime.kind === 'chop' ? 4 : 1) * PULL_K
	const pull = pullK * (Math.log(cs.price) - lnAnchor(c, t))
	let ret =
		cs.regime.drift +
		c.beta * g.mood * MOOD_DRIFT +
		c.drift / TPD +
		MOMENTUM * cs.prevRet -
		pull +
		drift +
		sigma * z +
		jump
	if (r.next() < JUMP_P * (1 + Math.abs(g.mood))) {
		const dir = r.next() < 0.5 + 0.15 * g.mood ? 1 : -1
		ret += dir * sigma * (4 + 6 * r.next())
	}
	ret = clamp(ret, -0.4, 0.4)
	cs.volState = clamp(
		0.96 * cs.volState + 0.04 * 1.2533 * Math.abs(z),
		0.5,
		2.8
	)
	cs.prevRet = ret
	cs.price = Math.max(0.01, cs.price * Math.exp(ret))
	const vol = Math.round(
		(c.baseVolume / TPD) *
			(0.55 + 0.9 * r.next()) *
			(1 + (0.6 * Math.abs(ret)) / sigma0) *
			(1 + vadd * 2) *
			(0.8 + 0.4 * g.cycleVol)
	)
	r.write(cs.rng)
	if (record) pushBar(cs.bars, t, round2(cs.price), vol)
}

export interface Candle {
	t: number
	o: number
	h: number
	l: number
	c: number
	v: number
}

export function aggregate(bars: Bar[], k: number): Candle[] {
	const out: Candle[] = []
	let cur = Number.NEGATIVE_INFINITY
	const span = BAR_TICKS * k
	for (const b of bars) {
		const gid = Math.floor(b[0] / span)
		if (gid !== cur) {
			out.push({ t: gid * span, o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] })
			cur = gid
		} else {
			const x = out[out.length - 1]
			if (b[2] > x.h) x.h = b[2]
			if (b[3] < x.l) x.l = b[3]
			x.c = b[4]
			x.v += b[5]
		}
	}
	return out
}

export interface Forecast {
	mean: number[]
	hi: number[]
	lo: number[]
	stepTicks: number
	dir: 'up' | 'down' | 'flat'
	expPct: number
	loPct: number
	hiPct: number
	conf: 'низкая' | 'средняя' | 'высокая'
	horizonTicks: number
}

export function forecast(
	g: GameState,
	coinId: string,
	steps: number,
	stepTicks: number
): Forecast | null {
	const c = g.coins.find(x => x.id === coinId)
	const cs = g.markets[coinId]
	if (!c || !cs || steps < 1) return null
	const horizon = steps * stepTicks
	const known = eventsOverlapping(g, g.tick, g.tick + horizon).filter(
		ev =>
			ev.headline !== '' &&
			ev.newsTick <= g.tick &&
			ev.impacts[coinId] !== undefined
	)
	const bars = cs.bars
	let ago = bars[0][1]
	const target = g.tick - 30
	for (let i = bars.length - 1; i >= 0; i--) {
		if (bars[i][0] <= target) {
			ago = bars[i][4]
			break
		}
	}
	const m0 = (Math.log(round2(cs.price)) - Math.log(Math.max(0.01, ago))) / 30
	const sigma0 = c.volatility / SQRT_TPD
	let lnp = Math.log(cs.price)
	const start = lnp
	let variance = 0
	const mean: number[] = []
	const hi: number[] = []
	const lo: number[] = []
	for (let k = 1; k <= horizon; k++) {
		const t = g.tick + k
		let d = 0
		if (k <= cs.regime.left) d += cs.regime.drift * 0.5
		d += c.beta * g.mood * MOOD_DRIFT + c.drift / TPD
		d -= PULL_K * (lnp - lnAnchor(c, t))
		d += 0.4 * m0 * Math.pow(0.985, k)
		for (const ev of known) {
			const e = eventEffect(ev, coinId, t, g.mood)
			d += e.jump + e.drift
		}
		lnp += d
		const decay = Math.pow(0.97, k)
		const sig =
			sigma0 *
			g.cycleVol *
			(1 + (cs.volState - 1) * decay) *
			(k <= cs.regime.left ? cs.regime.vol : 1)
		variance += sig * sig * 1.2
		if (k % stepTicks === 0) {
			const sd = Math.sqrt(variance)
			mean.push(Math.exp(lnp))
			hi.push(Math.exp(lnp + 1.28 * sd))
			lo.push(Math.exp(lnp - 1.28 * sd))
		}
	}
	const sd = Math.sqrt(variance)
	const move = lnp - start
	const z = Math.abs(move) / (sd || 1)
	const dir = Math.abs(move) < 0.35 * sd ? 'flat' : move > 0 ? 'up' : 'down'
	const conf = z > 0.9 ? 'высокая' : z > 0.5 ? 'средняя' : 'низкая'
	const cur = cs.price
	return {
		mean,
		hi,
		lo,
		stepTicks,
		dir,
		expPct: Math.exp(move) - 1,
		loPct: lo[lo.length - 1] / cur - 1,
		hiPct: hi[hi.length - 1] / cur - 1,
		conf,
		horizonTicks: horizon
	}
}
