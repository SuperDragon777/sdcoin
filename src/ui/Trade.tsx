import { useMemo, useState } from 'react'
import { useGame, useStore } from '../store/store'
import { grossFor, quoteKop } from '../engine/finance'
import { fmtDateTime } from '../engine/time'
import { OrderForm } from './OrderForm'
import { Panel, Seg } from './common'
import { dirClass, kop, pct, priceStr, signedKop, units } from './format'

const TYPE_LABEL = {
	buy: 'Покупка',
	sell: 'Продажа',
	liquidation: 'Ликвидация'
}

export function Trade() {
	const g = useGame()
	const coinId = useStore(s => s.coinId)
	const select = useStore(s => s.selectCoin)
	const [filter, setFilter] = useState<string>('all')
	const [limit, setLimit] = useState(50)
	const coin = g.coins.find(c => c.id === coinId) ?? g.coins[0]
	const rows = useMemo(
		() =>
			g.transactions
				.filter(t => filter === 'all' || t.coinId === filter)
				.slice()
				.reverse(),
		[g.transactions.length, filter]
	)
	if (!coin)
		return <div className="empty">Монет нет. Добавьте их в админ-панели.</div>
	return (
		<div className="stack">
			<div className="grid g-main-l">
				<Panel title="Новая сделка">
					<div className="stack">
						<select
							className="input"
							value={coin.id}
							onChange={e => select(e.target.value)}
						>
							{g.coins.map(c => (
								<option
									key={c.id}
									value={c.id}
								>
									{c.ticker} — {c.name}
								</option>
							))}
						</select>
						<OrderForm coinId={coin.id} />
					</div>
				</Panel>
				<Panel
					title="Текущий портфель"
					flush
				>
					{Object.keys(g.holdings).length === 0 ? (
						<div className="empty">Позиций пока нет. Купите первую монету.</div>
					) : (
						<div className="scroll-x">
							<table className="t">
								<thead>
									<tr>
										<th>Монета</th>
										<th className="num">Количество</th>
										<th className="num">Стоимость</th>
										<th className="num">Результат</th>
									</tr>
								</thead>
								<tbody>
									{Object.keys(g.holdings).map(id => {
										const h = g.holdings[id]
										const c = g.coins.find(x => x.id === id)
										const cs = g.markets[id]
										if (!c || !cs) return null
										const val = grossFor(h.units, quoteKop(cs.price))
										const pl = val - h.costBasis
										return (
											<tr
												key={id}
												className="click"
												onClick={() => select(id)}
											>
												<td>
													<span
														className="dot"
														style={{ background: c.color }}
													/>{' '}
													<b>{c.ticker}</b>
												</td>
												<td className="num">{units(h.units)}</td>
												<td className="num">{kop(val)}</td>
												<td className={'num ' + dirClass(pl)}>
													{signedKop(pl)}{' '}
													<span className="small">
														{pct(h.costBasis ? pl / h.costBasis : 0)}
													</span>
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					)}
				</Panel>
			</div>
			<Panel
				title="История операций"
				actions={
					<Seg
						value={filter}
						options={[
							{ v: 'all', l: 'Все' },
							...g.coins.map(c => ({ v: c.id, l: c.ticker }))
						]}
						onChange={v => {
							setFilter(v)
							setLimit(50)
						}}
					/>
				}
				flush
			>
				{rows.length === 0 ? (
					<div className="empty">Операций пока не было.</div>
				) : (
					<div className="scroll-x">
						<table className="t">
							<thead>
								<tr>
									<th>Время</th>
									<th>Операция</th>
									<th>Монета</th>
									<th className="num">Количество</th>
									<th className="num">Цена</th>
									<th className="num">Сумма</th>
									<th className="num">Комиссия</th>
									<th className="num">Итого</th>
									<th className="num">Результат</th>
								</tr>
							</thead>
							<tbody>
								{rows.slice(0, limit).map(t => (
									<tr key={t.id}>
										<td className="muted">{fmtDateTime(t.tick)}</td>
										<td>
											<span
												className={
													'tag ' +
													(t.type === 'buy'
														? 'pos'
														: t.type === 'sell'
															? 'neg'
															: 'warn')
												}
											>
												{TYPE_LABEL[t.type]}
											</span>
										</td>
										<td>{t.ticker}</td>
										<td className="num">{units(t.units)}</td>
										<td className="num">{priceStr(t.price / 100)} ₽</td>
										<td className="num">{kop(t.gross)}</td>
										<td className="num">{kop(t.fee)}</td>
										<td className="num">
											{(t.type === 'buy' ? '−' : '+') + kop(t.total)}
										</td>
										<td className={'num ' + dirClass(t.realized)}>
											{t.type === 'buy' ? '—' : signedKop(t.realized)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{rows.length > limit && (
							<div className="panel-b">
								<button
									className="btn"
									onClick={() => setLimit(limit + 100)}
								>
									Показать ещё
								</button>
							</div>
						)}
					</div>
				)}
			</Panel>
		</div>
	)
}
