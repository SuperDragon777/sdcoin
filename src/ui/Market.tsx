import { useState } from 'react'
import { useGame, useStore } from '../store/store'
import { TPD, BAR_TICKS } from '../engine/constants'
import { forecast } from '../engine/market'
import { fmtDuration } from '../engine/time'
import { FORECAST_STEPS, PriceChart } from './charts'
import { Delta, Panel, Seg, Spark, usePriceFlash } from './common'
import { OrderForm } from './OrderForm'
import {
	changeOver,
	closes,
	realizedVol,
	rsi14,
	trendOf,
	volume24
} from './analytics'
import { compactRub, dirClass, pct, priceStr } from './format'
import { Coin } from '../engine/types'

function CoinRow({
	c,
	sel,
	onSel
}: {
	c: Coin
	sel: boolean
	onSel: () => void
}) {
	const g = useGame()
	const cs = g.markets[c.id]
	const flash = usePriceFlash(cs.price)
	return (
		<tr
			className={'click' + (sel ? ' sel' : '')}
			onClick={onSel}
		>
			<td>
				<span
					className="dot"
					style={{ background: c.color }}
				/>{' '}
				<b>{c.ticker}</b>
				<div className="muted small">{c.name}</div>
			</td>
			<td className={'num ' + flash}>
				<b>{priceStr(cs.price)} ₽</b>
			</td>
			<td className="num">
				<Delta v={changeOver(g, c.id, 15)} />
			</td>
			<td className="num">
				<Delta v={changeOver(g, c.id, TPD)} />
			</td>
			<td className="num hide-s">
				<Delta v={changeOver(g, c.id, 7 * TPD)} />
			</td>
			<td className="num hide-s">{compactRub(volume24(g, c.id))}</td>
			<td className="hide-s">
				<Spark data={closes(g, c.id, 72)} />
			</td>
		</tr>
	)
}

const INTERVALS = [
	{ v: 1, l: '20 мин' },
	{ v: 3, l: '1 час' },
	{ v: 12, l: '4 часа' },
	{ v: 72, l: '1 день' }
]

export function Market() {
	const g = useGame()
	const coinId = useStore(s => s.coinId)
	const select = useStore(s => s.selectCoin)
	const [k, setK] = useState(3)
	const [smaOn, setSma] = useState(true)
	const [emaOn, setEma] = useState(false)
	const [fcOn, setFc] = useState(true)
	const coin = g.coins.find(c => c.id === coinId) ?? g.coins[0]
	if (!coin)
		return <div className="empty">Монет нет. Добавьте их в админ-панели.</div>
	const cs = g.markets[coin.id]
	const trend = trendOf(g, coin.id)
	const rsi = rsi14(g, coin.id)
	const rv = realizedVol(g, coin.id)
	const f = forecast(g, coin.id, FORECAST_STEPS, BAR_TICKS * k)
	const dirText = f
		? f.dir === 'up'
			? 'Рост'
			: f.dir === 'down'
				? 'Снижение'
				: 'Боковое движение'
		: '—'
	return (
		<div className="stack">
			<Panel
				title="Монеты"
				flush
			>
				<div className="scroll-x">
					<table className="t">
						<thead>
							<tr>
								<th>Монета</th>
								<th className="num">Цена</th>
								<th className="num">1 ч</th>
								<th className="num">24 ч</th>
								<th className="num hide-s">7 дн</th>
								<th className="num hide-s">Объём 24 ч</th>
								<th className="hide-s">Динамика</th>
							</tr>
						</thead>
						<tbody>
							{g.coins.map(c => (
								<CoinRow
									key={c.id}
									c={c}
									sel={c.id === coin.id}
									onSel={() => select(c.id)}
								/>
							))}
						</tbody>
					</table>
				</div>
			</Panel>
			<div className="grid g-main">
				<Panel
					title={`${coin.name} · ${coin.ticker}`}
					actions={
						<>
							<Seg
								value={k}
								options={INTERVALS}
								onChange={setK}
							/>
							<label className="row small">
								<input
									type="checkbox"
									checked={smaOn}
									onChange={e => setSma(e.target.checked)}
								/>{' '}
								SMA 20
							</label>
							<label className="row small">
								<input
									type="checkbox"
									checked={emaOn}
									onChange={e => setEma(e.target.checked)}
								/>{' '}
								EMA 50
							</label>
							<label className="row small">
								<input
									type="checkbox"
									checked={fcOn}
									onChange={e => setFc(e.target.checked)}
								/>{' '}
								Прогноз
							</label>
						</>
					}
				>
					<PriceChart
						coinId={coin.id}
						k={k}
						showSma={smaOn}
						showEma={emaOn}
						showForecast={fcOn}
					/>
					<p
						className="dim small"
						style={{ marginTop: 6 }}
					>
						Колесо мыши — масштаб, перетаскивание — перемещение. Пунктир —
						ожидаемый путь, точки — диапазон с вероятностью около 80%.
					</p>
				</Panel>
				<div className="stack">
					<Panel title="Торговля">
						<OrderForm coinId={coin.id} />
					</Panel>
					<Panel title="Индикаторы и прогноз">
						<div className="kv small">
							<span className="k">Тренд</span>
							<span
								className={
									'v ' +
									(trend.dir === 'up'
										? 'up'
										: trend.dir === 'down'
											? 'down'
											: '')
								}
							>
								{trend.label}
							</span>
							<span className="k">RSI (14)</span>
							<span className="v">
								{rsi === null ? '—' : rsi.toFixed(0)}
								{rsi !== null &&
									(rsi > 70
										? ' · перекупленность'
										: rsi < 30
											? ' · перепроданность'
											: '')}
							</span>
							<span className="k">Волатильность</span>
							<span className="v">
								{rv < 0.8 ? 'Низкая' : rv < 1.3 ? 'Умеренная' : 'Высокая'}
							</span>
							<span className="k">За 24 часа</span>
							<span className={'v ' + dirClass(changeOver(g, coin.id, TPD))}>
								{pct(changeOver(g, coin.id, TPD))}
							</span>
							<span className="k">Объём 24 ч</span>
							<span className="v">{compactRub(volume24(g, coin.id))}</span>
						</div>
						<div className="sep" />
						{f ? (
							<div className="kv small">
								<span className="k">
									Прогноз на {fmtDuration(f.horizonTicks)}
								</span>
								<span
									className={
										'v ' +
										(f.dir === 'up' ? 'up' : f.dir === 'down' ? 'down' : '')
									}
								>
									{dirText}
								</span>
								<span className="k">Ожидаемо</span>
								<span className="v">
									<Delta v={f.expPct} />
								</span>
								<span className="k">Диапазон</span>
								<span className="v">
									{priceStr(f.lo[f.lo.length - 1])} –{' '}
									{priceStr(f.hi[f.hi.length - 1])} ₽
								</span>
								<span className="k">Уверенность</span>
								<span className="v">{f.conf}</span>
							</div>
						) : (
							<span className="muted">Нет данных для прогноза.</span>
						)}
						<p
							className="dim small"
							style={{ marginTop: 8 }}
						>
							Прогноз учитывает тренд, настроения рынка и опубликованные
							новости. Скрытые события в нём не отражены, поэтому реальное
							движение может отличаться.
						</p>
						<div className="sep" />
						<p className="small muted">{coin.description}</p>
						<p className="small dim">Текущая цена {priceStr(cs.price)} ₽</p>
					</Panel>
				</div>
			</div>
		</div>
	)
}
