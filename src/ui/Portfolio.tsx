import { useState } from 'react'
import { useGame, useStore } from '../store/store'
import { equityOf, holdingsValue } from '../engine/game'
import { grossFor, mulDiv, quoteKop } from '../engine/finance'
import { UNIT } from '../engine/constants'
import { EquityChart } from './charts'
import { Delta, Kpi, Panel, Seg } from './common'
import { equityPeriod, Period, PERIODS } from './equity'
import { dirClass, kop, priceStr, signedKop, units } from './format'

export function Portfolio() {
	const g = useGame()
	const select = useStore(s => s.selectCoin)
	const setView = useStore(s => s.setView)
	const [period, setPeriod] = useState<Period>('all')
	const ids = Object.keys(g.holdings).filter(id => g.markets[id])
	const pv = holdingsValue(g)
	let unreal = 0
	const rows = ids.map(id => {
		const h = g.holdings[id]
		const c = g.coins.find(x => x.id === id)!
		const pk = quoteKop(g.markets[id].price)
		const val = grossFor(h.units, pk)
		const pl = val - h.costBasis
		unreal += pl
		const avg = h.units > 0 ? mulDiv(h.costBasis, UNIT, h.units) : 0
		return { id, h, c, val, pl, avg, pk }
	})
	const ep = equityPeriod(g, period)
	const eq = equityOf(g)
	return (
		<div className="stack">
			<div className="grid g4">
				<Kpi
					label="Стоимость портфеля"
					value={kop(pv)}
					sub={`Свободно: ${kop(g.cash)}`}
				/>
				<Kpi
					label="Нереализованный результат"
					value={signedKop(unreal)}
					cls={dirClass(unreal)}
				/>
				<Kpi
					label="Реализованный результат"
					value={signedKop(g.realized)}
					cls={dirClass(g.realized)}
					sub={`Комиссии: ${kop(g.feesPaid)}`}
				/>
				<Kpi
					label="Итого к стартовому капиталу"
					value={signedKop(eq - g.capitalBase)}
					cls={dirClass(eq - g.capitalBase)}
					sub={<Delta v={g.capitalBase > 0 ? eq / g.capitalBase - 1 : 0} />}
				/>
			</div>
			<Panel
				title="Позиции"
				flush
			>
				{rows.length === 0 ? (
					<div className="empty">В портфеле нет монет.</div>
				) : (
					<div className="scroll-x">
						<table className="t">
							<thead>
								<tr>
									<th>Монета</th>
									<th className="num">Количество</th>
									<th className="num">Средняя цена</th>
									<th className="num">Текущая цена</th>
									<th className="num">Стоимость</th>
									<th className="num">Нереализ.</th>
									<th className="num">Реализ.</th>
									<th className="num">Доля</th>
								</tr>
							</thead>
							<tbody>
								{rows.map(r => (
									<tr
										key={r.id}
										className="click"
										onClick={() => {
											select(r.id)
											setView('trade')
										}}
									>
										<td>
											<span
												className="dot"
												style={{ background: r.c.color }}
											/>{' '}
											<b>{r.c.ticker}</b>
											<div className="muted small">{r.c.name}</div>
										</td>
										<td className="num">{units(r.h.units)}</td>
										<td className="num">{priceStr(r.avg / 100)} ₽</td>
										<td className="num">{priceStr(r.pk / 100)} ₽</td>
										<td className="num">{kop(r.val)}</td>
										<td className={'num ' + dirClass(r.pl)}>
											{signedKop(r.pl)}
										</td>
										<td
											className={'num ' + dirClass(g.realizedByCoin[r.id] ?? 0)}
										>
											{signedKop(g.realizedByCoin[r.id] ?? 0)}
										</td>
										<td className="num">
											{pv > 0
												? ((r.val / pv) * 100).toFixed(1).replace('.', ',')
												: '0'}
											%
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				{rows.length > 0 && (
					<div className="panel-b">
						<div className="bar">
							{rows.map(r => (
								<i
									key={r.id}
									style={{
										width: `${pv > 0 ? (r.val / pv) * 100 : 0}%`,
										background: r.c.color
									}}
								/>
							))}
						</div>
					</div>
				)}
			</Panel>
			<Panel
				title="История капитала"
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
		</div>
	)
}
