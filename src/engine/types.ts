export type Phase =
	| 'stagnation'
	| 'expansion'
	| 'euphoria'
	| 'correction'
	| 'crisis'
	| 'recovery'
export type RegimeKind = 'calm' | 'bull' | 'bear' | 'chop' | 'rally' | 'crash'
export type Shape = 'shock' | 'spike' | 'ramp' | 'sustained'
export type Sentiment = 'pos' | 'neg' | 'neu'
export type Importance = 1 | 2 | 3

export interface Coin {
	id: string
	name: string
	ticker: string
	startPrice: number
	volatility: number
	drift: number
	beta: number
	baseVolume: number
	color: string
	description: string
	createdTick: number
}

export interface Regime {
	kind: RegimeKind
	drift: number
	vol: number
	left: number
}

export type Bar = [number, number, number, number, number, number]

export interface CoinState {
	price: number
	regime: Regime
	volState: number
	prevRet: number
	rng: number[]
	bars: Bar[]
}

export interface GameEvent {
	id: string
	source: 'generated' | 'admin'
	scope: 'coin' | 'macro'
	tpl: string
	startTick: number
	newsTick: number
	duration: number
	shape: Shape
	strength: number
	impacts: Record<string, number>
	headline: string
	body: string
	importance: Importance
	sentiment: Sentiment
}

export interface NewsItem {
	id: string
	tick: number
	headline: string
	body: string
	coinIds: string[]
	market: boolean
	sentiment: Sentiment
	importance: Importance
	source: 'generated' | 'admin'
	eventId?: string
}

export interface Holding {
	units: number
	costBasis: number
}

export type TxType = 'buy' | 'sell' | 'liquidation'

export interface Tx {
	id: number
	tick: number
	type: TxType
	coinId: string
	ticker: string
	units: number
	price: number
	gross: number
	fee: number
	total: number
	realized: number
	cashAfter: number
}

export interface Settings {
	feeBp: number
	minTrade: number
	tradingEnabled: boolean
	secondsPerDay: number
	marketVolMult: number
	eventDensity: number
}

export interface AudioSettings {
	master: number
	music: number
	sfx: number
	musicOn: boolean
	sfxOn: boolean
}

export interface AdminLogEntry {
	tick: number
	text: string
}

export interface PhaseOverride {
	phase: Phase
	until: number
}

export interface GameState {
	seed: string
	simVersion: number
	createdAt: string
	tick: number
	startTick: number
	speed: number
	paused: boolean
	cash: number
	startingCash: number
	capitalBase: number
	realized: number
	feesPaid: number
	holdings: Record<string, Holding>
	realizedByCoin: Record<string, number>
	transactions: Tx[]
	nextTxId: number
	coins: Coin[]
	markets: Record<string, CoinState>
	mood: number
	cycleVol: number
	phaseOverride: PhaseOverride | null
	customEvents: GameEvent[]
	suppressed: string[]
	customNews: NewsItem[]
	news: NewsItem[]
	deletedNews: string[]
	nextId: number
	equity: [number, number][]
	adminLog: AdminLogEntry[]
	settings: Settings
	audio: AudioSettings
}

export type TradeResult = { ok: true; tx: Tx } | { ok: false; error: string }
