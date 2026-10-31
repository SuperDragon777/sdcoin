import {
	Coin,
	GameEvent,
	GameState,
	NewsItem,
	Phase,
	RegimeKind
} from './types'
import { TPD } from './constants'
import { createGame, equityOf, forgetPublished } from './game'
import { initCoinState, makeRegime, pushBar } from './market'
import { grossFor, quoteKop } from './finance'
import { round2, stream } from './prng'
import { fmtDateTime } from './time'

export function logAdmin(g: GameState, text: string): void {
	g.adminLog.push({ tick: g.tick, text })
	if (g.adminLog.length > 300) g.adminLog.splice(0, g.adminLog.length - 300)
}

export interface CoinInput {
	name: string
	ticker: string
	startPrice: number
	volatility: number
	drift: number
	beta: number
	baseVolume: number
	color: string
	description: string
}

export function validateCoin(
	g: GameState,
	input: CoinInput,
	editId?: string
): string | null {
	if (!input.name.trim()) return 'Укажите название монеты.'
	if (!/^[A-Z0-9]{2,6}$/.test(input.ticker))
		return 'Тикер: от 2 до 6 латинских букв или цифр в верхнем регистре.'
	if (g.coins.some(c => c.ticker === input.ticker && c.id !== editId))
		return 'Монета с таким тикером уже есть.'
	if (!(input.startPrice >= 1)) return 'Цена должна быть не меньше 1 ₽.'
	if (!(input.volatility >= 0.005 && input.volatility <= 0.3))
		return 'Волатильность: от 0,5% до 30% в день.'
	if (!(input.beta >= 0.1 && input.beta <= 3))
		return 'Чувствительность к рынку: от 0,1 до 3.'
	if (!(input.baseVolume > 0)) return 'Объём торгов должен быть больше нуля.'
	if (!(Math.abs(input.drift) <= 0.02))
		return 'Дрейф: не более 2% в день по модулю.'
	return null
}

export function addCoin(g: GameState, input: CoinInput): string | null {
	const err = validateCoin(g, input)
	if (err) return err
	let id = input.ticker.toLowerCase()
	while (g.coins.some(c => c.id === id)) id += 'x'
	const coin: Coin = {
		id,
		...input,
		name: input.name.trim(),
		createdTick: g.tick
	}
	g.coins = [...g.coins, coin]
	g.markets[id] = initCoinState(g, coin, g.tick)
	logAdmin(
		g,
		`Добавлена монета ${coin.name} (${coin.ticker}) по ${coin.startPrice} ₽`
	)
	return null
}

export function updateCoin(
	g: GameState,
	id: string,
	input: CoinInput
): string | null {
	const err = validateCoin(g, input, id)
	if (err) return err
	g.coins = g.coins.map(c =>
		c.id === id ? { ...c, ...input, name: input.name.trim() } : c
	)
	logAdmin(g, `Изменены параметры монеты ${input.ticker}`)
	return null
}

export function removeCoin(g: GameState, id: string): void {
	const coin = g.coins.find(c => c.id === id)
	const cs = g.markets[id]
	if (!coin || !cs) return
	const h = g.holdings[id]
	if (h) {
		const gross = grossFor(h.units, quoteKop(cs.price))
		const realized = gross - h.costBasis
		g.cash += gross
		g.realized += realized
		g.realizedByCoin[id] = (g.realizedByCoin[id] ?? 0) + realized
		g.transactions.push({
			id: g.nextTxId++,
			tick: g.tick,
			type: 'liquidation',
			coinId: id,
			ticker: coin.ticker,
			units: h.units,
			price: quoteKop(cs.price),
			gross,
			fee: 0,
			total: gross,
			realized,
			cashAfter: g.cash
		})
		delete g.holdings[id]
	}
	g.coins = g.coins.filter(c => c.id !== id)
	delete g.markets[id]
	logAdmin(
		g,
		`Удалена монета ${coin.ticker}${h ? ' (позиция продана по рыночной цене без комиссии)' : ''}`
	)
}

export function setSettings(
	g: GameState,
	patch: Partial<GameState['settings']>
): void {
	g.settings = { ...g.settings, ...patch }
	logAdmin(g, 'Изменены экономические настройки')
}

export function setStartingCash(g: GameState, kop: number): void {
	g.startingCash = kop
	logAdmin(g, `Начальный баланс для новых игр: ${kop / 100} ₽`)
}

export function adjustCash(g: GameState, delta: number): string | null {
	if (g.cash + delta < 0) return 'Баланс не может стать отрицательным.'
	g.cash += delta
	g.capitalBase += delta
	logAdmin(g, `Баланс игрока изменён на ${delta / 100} ₽`)
	return null
}

export function setPrice(
	g: GameState,
	coinId: string,
	price: number
): string | null {
	const cs = g.markets[coinId]
	const c = g.coins.find(x => x.id === coinId)
	if (!cs || !c) return 'Монета не найдена.'
	if (!(price >= 0.01)) return 'Цена должна быть не меньше 0,01 ₽.'
	cs.price = price
	cs.prevRet = 0
	pushBar(cs.bars, g.tick, round2(price), 0)
	logAdmin(g, `Цена ${c.ticker} установлена вручную: ${round2(price)} ₽`)
	return null
}

export function forceRegime(
	g: GameState,
	coinId: string,
	kind: RegimeKind,
	days: number
): void {
	const cs = g.markets[coinId]
	const c = g.coins.find(x => x.id === coinId)
	if (!cs || !c) return
	const r = stream(g.seed, `admin-regime:${coinId}:${g.tick}:${kind}`)
	cs.regime = makeRegime(r, kind, c, days)
	logAdmin(g, `Для ${c.ticker} задан режим «${kind}» на ${days} дн.`)
}

export function forcePhase(g: GameState, phase: Phase, days: number): void {
	g.phaseOverride = { phase, until: g.tick + Math.round(days * TPD) }
	logAdmin(g, `Фаза рынка принудительно: ${phase} на ${days} дн.`)
}

export function clearPhase(g: GameState): void {
	g.phaseOverride = null
	logAdmin(g, 'Принудительная фаза рынка снята')
}

export function saveEvent(
	g: GameState,
	ev: GameEvent,
	replaceId?: string
): void {
	if (replaceId) {
		const idx = g.customEvents.findIndex(e => e.id === replaceId)
		if (idx >= 0) {
			g.customEvents[idx] = ev
		} else {
			if (!g.suppressed.includes(replaceId)) g.suppressed.push(replaceId)
			g.customEvents.push(ev)
		}
	} else {
		g.customEvents.push(ev)
	}
	logAdmin(
		g,
		`Событие «${ev.headline || ev.id}» запланировано на ${fmtDateTime(ev.startTick)}`
	)
}

export function newId(g: GameState, prefix: string): string {
	return `${prefix}${g.nextId++}`
}

export function deleteEvent(g: GameState, id: string): void {
	const idx = g.customEvents.findIndex(e => e.id === id)
	if (idx >= 0) g.customEvents.splice(idx, 1)
	else if (!g.suppressed.includes(id)) g.suppressed.push(id)
	logAdmin(g, `Удалено событие ${id}`)
}

export function saveNews(g: GameState, item: NewsItem): void {
	const ci = g.customNews.findIndex(n => n.id === item.id)
	if (ci >= 0) g.customNews[ci] = item
	else if (!g.news.some(n => n.id === item.id)) g.customNews.push(item)
	const ni = g.news.findIndex(n => n.id === item.id)
	if (ni >= 0) g.news[ni] = { ...g.news[ni], ...item }
	forgetPublished(g)
	logAdmin(g, `Сохранена новость «${item.headline}»`)
}

export function deleteNews(g: GameState, id: string): void {
	g.customNews = g.customNews.filter(n => n.id !== id)
	g.news = g.news.filter(n => n.id !== id)
	if (!g.deletedNews.includes(id)) g.deletedNews.push(id)
	forgetPublished(g)
	logAdmin(g, `Удалена новость ${id}`)
}

export function rebuild(g: GameState, seed: string): GameState {
	const next = createGame({
		seed,
		startingCash: g.startingCash,
		coins: g.coins,
		settings: g.settings,
		audio: g.audio,
		adminLog: g.adminLog
	})
	logAdmin(next, `Вселенная пересоздана, seed: ${seed}`)
	return next
}

export function totalEquity(g: GameState): number {
	return equityOf(g)
}
