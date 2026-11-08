import {
	createGame,
	executeTrade,
	serialize,
	deserialize,
	stepGame,
	equityOf
} from '../src/engine/game'
import { unitsForBudget, quoteBuy, quoteKop } from '../src/engine/finance'
import { TPD } from '../src/engine/constants'

function run(seed: string, days: number) {
	const g = createGame({ seed, startingCash: 50_000_000 })
	for (let i = 0; i < days * TPD; i++) stepGame(g)
	return g
}

function digest(g: ReturnType<typeof run>): string {
	const parts = g.coins.map(c => g.markets[c.id].price.toFixed(8))
	return (
		parts.join('|') +
		'|' +
		g.news.length +
		'|' +
		g.news.map(n => n.id).join(',').length
	)
}

const a = run('verify-1', 60)
const b = run('verify-1', 60)
console.log('new game has MSR:', a.coins.some(c => c.id === 'msr' && c.startPrice === 1) ? 'OK' : 'FAIL')
console.log('determinism same seed:', digest(a) === digest(b) ? 'OK' : 'FAIL')
const c = run('verify-2', 60)
console.log('different seed differs:', digest(a) !== digest(c) ? 'OK' : 'FAIL')

const g1 = run('verify-1', 20)
const freshAtSameTick = run('verify-1', 20)
const buy = executeTrade(g1, 'buy', 'sdc', 3_500_000)
const legacy = JSON.parse(serialize(g1))
legacy.state.coins = legacy.state.coins.filter((c: { id: string }) => c.id !== 'msr')
delete legacy.state.markets.msr
const legacyCash = legacy.state.cash
const migrated = deserialize(JSON.stringify(legacy))
console.log(
	'legacy migration:',
	migrated.coins.some(c => c.id === 'msr') &&
		migrated.markets.msr.bars[migrated.markets.msr.bars.length - 1][0] <= migrated.tick &&
		migrated.cash === legacyCash &&
			migrated.markets.msr.price === freshAtSameTick.markets.msr.price
		? 'OK'
		: 'FAIL'
)
const migratedAgain = deserialize(serialize(migrated))
console.log(
	'migration idempotent:',
	migratedAgain.coins.filter(c => c.id === 'msr').length === 1 &&
		digest(migratedAgain) === digest(migrated)
		? 'OK'
		: 'FAIL'
)
const g2 = deserialize(serialize(g1))
for (let i = 0; i < 20 * TPD; i++) {
	stepGame(g1)
	stepGame(g2)
}
console.log('trade ok:', buy.ok)
console.log(
	'save/load continuity:',
	digest(g1 as never) === digest(g2 as never) && equityOf(g1) === equityOf(g2)
		? 'OK'
		: 'FAIL'
)

const dup = new Set(a.news.map(n => n.id))
console.log(
	'no duplicate news:',
	dup.size === a.news.length ? 'OK' : 'FAIL',
	a.news.length,
	'news in 74 days'
)

const pk = quoteKop(a.markets['sdc'].price)
const u = unitsForBudget(100_000_00, pk, 25)
const q = quoteBuy(u, pk, 25)
console.log(
	'budget fit:',
	q.total <= 100_000_00 && quoteBuy(u + 1, pk, 25).total > 100_000_00
		? 'OK'
		: 'FAIL',
	q
)

for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
	const g = createGame({ seed, startingCash: 1 })
	const mins: Record<string, number> = {}
	const maxs: Record<string, number> = {}
	for (let i = 0; i < 365 * TPD; i++) {
		stepGame(g, false)
		for (const c of g.coins) {
			const p = g.markets[c.id].price
			mins[c.id] = Math.min(mins[c.id] ?? p, p)
			maxs[c.id] = Math.max(maxs[c.id] ?? p, p)
		}
	}
	console.log(
		seed,
		g.coins
			.map(
				c =>
					`${c.ticker} ${g.markets[c.id].price.toFixed(1)} [${mins[c.id].toFixed(1)}..${maxs[c.id].toFixed(1)}]`
			)
			.join('  '),
		'news',
		g.news.length
	)
}
