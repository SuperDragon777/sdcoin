import { useMemo, useState } from 'react'
import { useGame, useStore } from '../store/store'
import { equityOf, holdingsValue } from '../engine/game'
import { TPD } from '../engine/constants'
import { fmtDateTime } from '../engine/time'
import { EquityChart } from './charts'
import { Delta, Importance, Kpi, Panel, Seg } from './common'
import { equityPeriod, Period, PERIODS } from './equity'
import { changeOver, marketState } from './analytics'
import { dirClass, kop, pct, priceStr, signedKop } from './format'

export function Dashboard() {
	const g = useGame()
	const setView = useStore(s => s.setView)
	const selectCoin = useStore(s => s.selectCoin)
	const openNews = useStore(s => s.openNews)
	const [period, setPeriod] = useState<Period>('7d')
	const eq = equityOf(g)
	const pv = holdingsValue(g)
	const pnl = eq - g.capitalBase
	const pnlPct = g.capitalBase > 0 ? pnl / g.capitalBase : 0
	const ep = equityPeriod(g, period)
	const ms = marketState(g)
	const important = useMemo(
		() =>
			g.news
				.filter(n => n.importance >= 2)
				.sort((a, b) => b.tick - a.tick || (a.id < b.id ? 1 : -1))
				.slice(0, 6),
		[g.news.length, g.tick]
	)
	return (
		<div className="stack">
			<div className="grid g4">
				<Kpi
					label="Общий капитал"
					value={kop(eq)}
					sub={<span>Старт: {kop(g.capitalBase)}</span>}
				/>
				<Kpi
					label="Свободный баланс"
					value={kop(g.cash)}
					sub={
						<span>
							{eq > 0
								? ((g.cash / eq) * 100).toFixed(1).replace('.', ',')
								: '0'}
							% капитала
						</span>
					}
				/>
				<Kpi
					label="Стоимость портфеля"
					value={kop(pv)}
					sub={<span>Позиций: {Object.keys(g.holdings).length}</span>}
				/>
				<Kpi
					label="Прибыль и убыток"
					value={signedKop(pnl)}
					cls={dirClass(pnl)}
					sub={<Delta v={pnlPct} />}
				/>
			</div>
			<div className="grid g-main">
				<Panel
					title="Динамика капитала"
					actions={
						<Seg
							value={period}
							options={PERIODS}
							onChange={setPeriod}
						/>
					}
				>
					<div
						className="row gap-lg"
						style={{ marginBottom: 8 }}
					>
						<span className="muted">Изменение за период</span>
						<b className={dirClass(ep.change)}>{signedKop(ep.change)}</b>
						<Delta v={ep.pct} />
					</div>
					<EquityChart points={ep.points} />
				</Panel>
				<Panel title="Состояние рынка">
					<div className="stack sm">
						<div className="kv">
							<span className="k">Направление</span>
							<span
								className={
									'v ' +
									(ms.dir === 'up' ? 'up' : ms.dir === 'down' ? 'down' : '')
								}
							>
								{ms.label}
							</span>
							<span className="k">Среднее за сутки</span>
							<span className="v">
								<Delta v={ms.avg24} />
							</span>
							<span className="k">Волатильность</span>
							<span className="v">{ms.volLabel}</span>
						</div>
						<div className="sep" />
						<table className="t">
							<tbody>
								{g.coins.map(c => {
									const ch = changeOver(g, c.id, TPD)
									return (
										<tr
											key={c.id}
											className="click"
											onClick={() => {
												selectCoin(c.id)
												setView('market')
											}}
										>
											<td>
												<span
													className="dot"
													style={{ background: c.color }}
												/>{' '}
												{c.ticker}
											</td>
											<td className="num">
												{priceStr(g.markets[c.id].price)} ₽
											</td>
											<td className="num">{pct(ch)}</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				</Panel>
			</div>
			<Panel
				title="Последние важные события"
				actions={
					<button
						className="btn sm"
						onClick={() => openNews(null)}
					>
						Все новости
					</button>
				}
				flush
			>
				{important.length === 0 ? (
					<div className="empty">Важных новостей пока нет.</div>
				) : (
					<div>
						{important.map(n => (
							<button
								key={n.id}
								className={'news-item'}
								onClick={() => openNews(n.id)}
							>
								<div className="row">
									<span className="muted small">{fmtDateTime(n.tick)}</span>
									<Importance n={n.importance} />
									<span className={'tag ' + n.sentiment}>
										{n.sentiment === 'pos'
											? 'Позитив'
											: n.sentiment === 'neg'
												? 'Негатив'
												: 'Нейтрально'}
									</span>
								</div>
								<div className="hd">{n.headline}</div>
							</button>
						))}
					</div>
				)}
			</Panel>
		</div>
	)
}
