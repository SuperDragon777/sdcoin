import {
	AudioSettings,
	Coin,
	GameState,
	NewsItem,
	Settings,
	TradeResult,
	Tx
} from './types'
import {
	EQUITY_STEP,
	FORMAT_VERSION,
	SIM_VERSION,
	TPD,
	WARMUP_DAYS
} from './constants'
import { PHASES, segmentAt } from './schedule'
import { activeEvents, eventsForDay, isSuppressed } from './events'
import { initCoinState, stepCoin } from './market'
import { grossFor, quoteBuy, quoteKop, quoteSell } from './finance'
import { mulDiv } from './finance'

export const defaultSettings = (): Settings => ({
	feeBp: 25,
	minTrade: 10000,
	tradingEnabled: true,
	secondsPerDay: 360,
	marketVolMult: 1,
	eventDensity: 1
})

export const defaultAudio = (): AudioSettings => ({
	master: 0.7,
	music: 0.35,
	sfx: 0.7,
	musicOn: true,
	sfxOn: true
})

const msrCoin = (): Coin => ({
	id: 'msr',
	name: 'MUSORcoin',
	ticker: 'MSR',
	startPrice: 1,
	volatility: 0.008,
	drift: 0.00005,
	beta: 0.15,
	baseVolume: 1_000_000,
	color: '#8e44ad',
	description: 'Дешёвая стабильная монета с небольшими рыночными колебаниями.',
	createdTick: 0
})

export const defaultCoins = (): Coin[] => [
	{
		id: 'sdc',
		name: 'SDcoin',
		ticker: 'SDC',
		startPrice: 1250,
		volatility: 0.04,
		drift: 0.0004,
		beta: 1,
		baseVolume: 48_000_000,
		color: '#5b9bd5',
		description:
			'Базовая расчётная монета платформы с умеренной волатильностью.',
		createdTick: 0
	},
	{
		id: 'mat',
		name: 'MATcoin',
		ticker: 'MAT',
		startPrice: 84.5,
		volatility: 0.065,
		drift: 0.0003,
		beta: 1.35,
		baseVolume: 21_000_000,
		color: '#d3a24a',
		description:
			'Более рискованный актив: сильнее реагирует на новости и настроения рынка.',
		createdTick: 0
	},
	msrCoin()
]

function buildCoinState(g: GameState, c: Coin, tick: number) {
	const replay = { ...g, tick: 0, phaseOverride: null }
	const def = PHASES[segmentAt(g.seed, 0).phase]
	replay.mood = def.mood
	replay.cycleVol = def.vol
	const state = initCoinState(replay, c, c.createdTick)
	for (let t = c.createdTick + 1; t <= tick; t++) {
		updateMood(replay, t)
		stepCoin(replay, c, state, t, activeEvents(replay, t), true)
	}
	return state
}

const published = new WeakMap<GameState, Set<string>>()

function publishedSet(g: GameState): Set<string> {
	let s = published.get(g)
	if (!s) {
		s = new Set<string>()
		for (const n of g.news) s.add(n.id)
		for (const id of g.deletedNews) s.add(id)
		published.set(g, s)
	}
	return s
}

export function forgetPublished(g: GameState): void {
	published.delete(g)
}

export function holdingsValue(g: GameState): number {
	let v = 0
	for (const id of Object.keys(g.holdings)) {
		const cs = g.markets[id]
		if (cs) v += grossFor(g.holdings[id].units, quoteKop(cs.price))
	}
	return v
}

export const equityOf = (g: GameState): number => g.cash + holdingsValue(g)

export function currentPhase(g: GameState, t: number) {
	if (g.phaseOverride && t < g.phaseOverride.until) return g.phaseOverride.phase
	return segmentAt(g.seed, t).phase
}

function updateMood(g: GameState, t: number): void {
	if (g.phaseOverride && t >= g.phaseOverride.until) g.phaseOverride = null
	const def = PHASES[currentPhase(g, t)]
	g.mood += (def.mood - g.mood) * 0.004
	g.cycleVol += (def.vol - g.cycleVol) * 0.004
}

function publishDue(g: GameState, t: number): void {
	const pub = publishedSet(g)
	const day = Math.floor(t / TPD)
	const items: { tick: number; item: NewsItem }[] = []
	const consider = (ev: {
		id: string
		headline: string
		body: string
		newsTick: number
		impacts: Record<string, number>
		scope: string
		sentiment: NewsItem['sentiment']
		importance: NewsItem['importance']
		source: 'generated' | 'admin'
	}) => {
		if (
			!ev.headline ||
			ev.newsTick > t ||
			pub.has(ev.id) ||
			isSuppressed(g, ev.id)
		)
			return
		items.push({
			tick: ev.newsTick,
			item: {
				id: ev.id,
				tick: ev.newsTick,
				headline: ev.headline,
				body: ev.body,
				coinIds: Object.keys(ev.impacts).filter(k => g.markets[k]),
				market: ev.scope === 'macro',
				sentiment: ev.sentiment,
				importance: ev.importance,
				source: ev.source,
				eventId: ev.id
			}
		})
	}
	for (const d of [day, day + 1])
		for (const ev of eventsForDay(g, d)) consider(ev)
	for (const ev of g.customEvents) consider(ev)
	for (const n of g.customNews) {
		if (n.tick <= t && !pub.has(n.id) && !g.deletedNews.includes(n.id))
			items.push({ tick: n.tick, item: { ...n } })
	}
	items.sort((a, b) => a.tick - b.tick || (a.item.id < b.item.id ? -1 : 1))
	for (const x of items) {
		pub.add(x.item.id)
		g.news.push(x.item)
	}
}

export function stepGame(g: GameState, record = true): void {
	g.tick += 1
	const t = g.tick
	updateMood(g, t)
	const evs = activeEvents(g, t)
	for (const c of g.coins) {
		const cs = g.markets[c.id]
		if (cs) stepCoin(g, c, cs, t, evs, true)
	}
	publishDue(g, t)
	if (record && (t - g.startTick) % EQUITY_STEP === 0)
		g.equity.push([t, equityOf(g)])
}

export interface NewGameOptions {
	seed: string
	startingCash: number
	coins?: Coin[]
	settings?: Settings
	audio?: AudioSettings
	adminLog?: GameState['adminLog']
}

export function createGame(o: NewGameOptions): GameState {
	const coins = (o.coins ?? defaultCoins()).map(c => ({ ...c, createdTick: 0 }))
	const g: GameState = {
		seed: o.seed,
		simVersion: SIM_VERSION,
		createdAt: new Date().toISOString(),
		tick: 0,
		startTick: 0,
		speed: 1,
		paused: false,
		cash: o.startingCash,
		startingCash: o.startingCash,
		capitalBase: o.startingCash,
		realized: 0,
		feesPaid: 0,
		holdings: {},
		realizedByCoin: {},
		transactions: [],
		nextTxId: 1,
		coins,
		markets: {},
		mood: 0,
		cycleVol: 1,
		phaseOverride: null,
		customEvents: [],
		suppressed: [],
		customNews: [],
		news: [],
		deletedNews: [],
		nextId: 1,
		equity: [],
		adminLog: o.adminLog ? o.adminLog.slice(-300) : [],
		settings: o.settings ? { ...o.settings } : defaultSettings(),
		audio: o.audio ? { ...o.audio } : defaultAudio()
	}
	const def = PHASES[segmentAt(g.seed, 0).phase]
	g.mood = def.mood
	g.cycleVol = def.vol
	for (const c of g.coins) g.markets[c.id] = initCoinState(g, c, 0)
	for (let i = 0; i < WARMUP_DAYS * TPD; i++) stepGame(g, false)
	g.startTick = g.tick
	g.equity = [[g.tick, g.cash]]
	return g
}

export function executeTrade(
	g: GameState,
	side: 'buy' | 'sell',
	coinId: string,
	units: number
): TradeResult {
	const coin = g.coins.find(c => c.id === coinId)
	const cs = g.markets[coinId]
	if (!coin || !cs) return { ok: false, error: 'Монета не найдена.' }
	if (!g.settings.tradingEnabled)
		return { ok: false, error: 'Торговля приостановлена администратором.' }
	if (!Number.isSafeInteger(units) || units <= 0)
		return { ok: false, error: 'Укажите количество монет.' }
	const priceKop = quoteKop(cs.price)
	if (side === 'buy') {
		const q = quoteBuy(units, priceKop, g.settings.feeBp)
		if (q.gross < g.settings.minTrade)
			return { ok: false, error: 'Сумма сделки меньше минимальной.' }
		if (q.total > g.cash)
			return { ok: false, error: 'Недостаточно свободных средств.' }
		g.cash -= q.total
		const h = g.holdings[coinId] ?? { units: 0, costBasis: 0 }
		h.units += units
		h.costBasis += q.total
		g.holdings[coinId] = h
		g.feesPaid += q.fee
		const tx: Tx = {
			id: g.nextTxId++,
			tick: g.tick,
			type: 'buy',
			coinId,
			ticker: coin.ticker,
			units,
			price: priceKop,
			gross: q.gross,
			fee: q.fee,
			total: q.total,
			realized: 0,
			cashAfter: g.cash
		}
		g.transactions.push(tx)
		return { ok: true, tx }
	}
	const h = g.holdings[coinId]
	if (!h || h.units < units)
		return { ok: false, error: 'Недостаточно монет для продажи.' }
	const q = quoteSell(units, priceKop, g.settings.feeBp)
	if (q.gross < g.settings.minTrade && units < h.units)
		return { ok: false, error: 'Сумма сделки меньше минимальной.' }
	const basisOut =
		units === h.units ? h.costBasis : mulDiv(h.costBasis, units, h.units)
	const realized = q.total - basisOut
	g.cash += q.total
	h.units -= units
	h.costBasis -= basisOut
	if (h.units === 0) delete g.holdings[coinId]
	g.realized += realized
	g.realizedByCoin[coinId] = (g.realizedByCoin[coinId] ?? 0) + realized
	g.feesPaid += q.fee
	const tx: Tx = {
		id: g.nextTxId++,
		tick: g.tick,
		type: 'sell',
		coinId,
		ticker: coin.ticker,
		units,
		price: priceKop,
		gross: q.gross,
		fee: q.fee,
		total: q.total,
		realized,
		cashAfter: g.cash
	}
	g.transactions.push(tx)
	return { ok: true, tx }
}

export function serialize(g: GameState): string {
	return JSON.stringify({
		format: 'sdgame',
		formatVersion: FORMAT_VERSION,
		simVersion: g.simVersion,
		savedAt: new Date().toISOString(),
		state: g
	})
}

function num(v: unknown, d: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : d
}

export function deserialize(text: string): GameState {
	let raw: any
	try {
		raw = JSON.parse(text)
	} catch {
		throw new Error(
			'Не удалось прочитать файл: он повреждён или не является JSON.'
		)
	}
	if (
		!raw ||
		raw.format !== 'sdgame' ||
		typeof raw.state !== 'object' ||
		raw.state === null
	) {
		throw new Error('Это не файл сохранения SDcoin (.sdgame).')
	}
	if (
		typeof raw.formatVersion !== 'number' ||
		raw.formatVersion > FORMAT_VERSION
	) {
		throw new Error(
			'Файл создан в более новой версии SDcoin и не может быть открыт.'
		)
	}
	const s = migrate(raw.formatVersion, raw.state)
	if (
		typeof s.seed !== 'string' ||
		!Array.isArray(s.coins) ||
		typeof s.markets !== 'object' ||
		s.markets === null
	) {
		throw new Error('В файле не хватает данных игры.')
	}
	const g = s as GameState
	g.settings = { ...defaultSettings(), ...(g.settings ?? {}) }
	g.audio = { ...defaultAudio(), ...(g.audio ?? {}) }
	g.tick = num(g.tick, 0)
	g.cash = num(g.cash, 0)
	g.speed = [0.5, 1, 2].includes(g.speed) ? g.speed : 1
	g.paused = !!g.paused
	g.holdings = g.holdings ?? {}
	g.realizedByCoin = g.realizedByCoin ?? {}
	g.transactions = g.transactions ?? []
	g.customEvents = g.customEvents ?? []
	g.suppressed = g.suppressed ?? []
	g.customNews = g.customNews ?? []
	g.news = g.news ?? []
	g.deletedNews = g.deletedNews ?? []
	g.equity = g.equity ?? []
	g.adminLog = g.adminLog ?? []
	g.phaseOverride = g.phaseOverride ?? null
	g.nextId = num(g.nextId, 1)
	g.nextTxId = num(g.nextTxId, 1)
	g.mood = num(g.mood, 0)
	g.cycleVol = num(g.cycleVol, 1)
	g.simVersion = num(g.simVersion, SIM_VERSION)
	if (!g.coins.some(c => c.id === 'msr')) {
		const c = msrCoin()
		g.coins.push(c)
		g.markets[c.id] = buildCoinState(g, c, g.tick)
	}
	for (const c of g.coins) {
		const m = g.markets[c.id]
		if (
			!m ||
			!Array.isArray(m.bars) ||
			 m.bars.length === 0 ||
			!Array.isArray(m.rng) ||
			 m.rng.length < 4
		) {
			throw new Error(`В файле нет данных рынка для монеты «${c.ticker}».`)
		}
	}
	return g
}

function migrate(version: number, state: any): any {
	let s = state
	if (version < 1) s = { ...s }
	return s
}

export function simulateFuture(
	g: GameState,
	coinId: string,
	ticks: number
): number[] {
	const c = g.coins.find(x => x.id === coinId)
	const cs0 = g.markets[coinId]
	if (!c || !cs0) return []
	const tmp: GameState = {
		...g,
		markets: {},
		phaseOverride: g.phaseOverride ? { ...g.phaseOverride } : null
	}
	const cs = { ...cs0, regime: { ...cs0.regime }, rng: [...cs0.rng], bars: [] }
	const out: number[] = []
	for (let i = 0; i < ticks; i++) {
		tmp.tick += 1
		updateMood(tmp, tmp.tick)
		stepCoin(tmp, c, cs, tmp.tick, activeEvents(tmp, tmp.tick), false)
		out.push(cs.price)
	}
	return out
}
