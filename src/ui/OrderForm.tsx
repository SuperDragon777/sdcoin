import { useState } from 'react'
import { useGame, useStore } from '../store/store'
import {
	feeFor,
	grossFor,
	quoteBuy,
	quoteKop,
	quoteSell,
	unitsForBudget,
	unitsForGross
} from '../engine/finance'
import { UNIT } from '../engine/constants'
import { Modal, Seg, usePriceFlash } from './common'
import { kop, parseDecimal, priceStr, units as fmtUnits } from './format'

type Side = 'buy' | 'sell'
type Mode = 'units' | 'amount'

export function OrderForm({ coinId }: { coinId: string }) {
	const g = useGame()
	const trade = useStore(s => s.trade)
	const toast = useStore(s => s.toast)
	const [side, setSide] = useState<Side>('buy')
	const [mode, setMode] = useState<Mode>('amount')
	const [text, setText] = useState('')
	const [confirm, setConfirm] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const coin = g.coins.find(c => c.id === coinId)
	const cs = g.markets[coinId]
	const flash = usePriceFlash(cs ? cs.price : 0)
	if (!coin || !cs) return <div className="empty">Выберите монету.</div>

	const priceKop = quoteKop(cs.price)
	const bp = g.settings.feeBp
	const held = g.holdings[coinId]?.units ?? 0
	const parsed =
		text.trim() === '' ? null : parseDecimal(text, mode === 'units' ? 6 : 2)
	let u = 0
	if (parsed !== null) {
		if (mode === 'units') u = parsed
		else if (side === 'buy') u = unitsForBudget(parsed, priceKop, bp)
		else u = Math.min(held, unitsForGross(parsed, priceKop))
	}
	const q =
		side === 'buy' ? quoteBuy(u, priceKop, bp) : quoteSell(u, priceKop, bp)

	let problem: string | null = null
	if (!g.settings.tradingEnabled)
		problem = 'Торговля приостановлена администратором.'
	else if (text.trim() !== '' && parsed === null)
		problem =
			mode === 'units'
				? 'Некорректное количество (не более 6 знаков после запятой).'
				: 'Некорректная сумма (не более 2 знаков после запятой).'
	else if (u <= 0)
		problem = text.trim() === '' ? null : 'Количество слишком мало.'
	else if (side === 'buy' && q.total > g.cash)
		problem = 'Недостаточно свободных средств.'
	else if (side === 'sell' && u > held)
		problem = 'Недостаточно монет для продажи.'
	else if (q.gross < g.settings.minTrade && !(side === 'sell' && u === held))
		problem = `Минимальная сумма сделки — ${kop(g.settings.minTrade)}.`

	const quick = (p: number) => {
		setError(null)
		if (side === 'buy') {
			setMode('amount')
			setText(((g.cash * p) / 100 / 100).toFixed(2).replace(/\.00$/, ''))
			if (p === 100)
				setText(
					String(Math.floor(g.cash / 100)) +
						(g.cash % 100 ? '.' + String(g.cash % 100).padStart(2, '0') : '')
				)
		} else {
			setMode('units')
			const x = p === 100 ? held : Math.floor((held * p) / 100)
			setText((x / UNIT).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''))
		}
	}

	const execute = () => {
		const res = trade(side, coinId, u)
		setConfirm(false)
		if (res.ok) {
			setText('')
			setError(null)
			toast({
				kind: 'trade',
				title: `${side === 'buy' ? 'Куплено' : 'Продано'} ${fmtUnits(res.tx.units)} ${coin.ticker}`,
				text: `${side === 'buy' ? 'Списано' : 'Получено'} ${kop(res.tx.total)}, комиссия ${kop(res.tx.fee)}`
			})
		} else setError(res.error)
	}

	return (
		<div className="stack">
			<div className="row">
				<span
					className="dot"
					style={{ background: coin.color }}
				/>
				<b>{coin.name}</b>
				<span className="muted">{coin.ticker}</span>
				<span
					className={'right ' + flash}
					style={{ padding: '0 4px' }}
				>
					<b>{priceStr(cs.price)} ₽</b>
				</span>
			</div>
			<Seg
				value={side}
				options={[
					{ v: 'buy', l: 'Купить' },
					{ v: 'sell', l: 'Продать' }
				]}
				onChange={v => {
					setSide(v)
					setText('')
					setError(null)
				}}
			/>
			<div className="field">
				<div className="row">
					<span className="lab grow">
						{mode === 'units'
							? `Количество, ${coin.ticker}`
							: side === 'buy'
								? 'Сумма с комиссией, ₽'
								: 'Сумма продажи, ₽'}
					</span>
					<Seg
						value={mode}
						options={[
							{ v: 'amount', l: '₽' },
							{ v: 'units', l: coin.ticker }
						]}
						onChange={m => {
							setMode(m)
							setText('')
						}}
					/>
				</div>
				<input
					className="input"
					inputMode="decimal"
					value={text}
					placeholder="0"
					onChange={e => {
						setText(e.target.value)
						setError(null)
					}}
				/>
				<div className="row wrap">
					{[25, 50, 75, 100].map(p => (
						<button
							key={p}
							className="btn sm"
							onClick={() => quick(p)}
						>
							{p}%
						</button>
					))}
				</div>
			</div>
			<div className="kv small">
				<span className="k">Цена</span>
				<span className="v">{priceStr(cs.price)} ₽</span>
				<span className="k">Количество</span>
				<span className="v">
					{fmtUnits(u)} {coin.ticker}
				</span>
				<span className="k">Сумма сделки</span>
				<span className="v">{kop(q.gross)}</span>
				<span className="k">
					Комиссия ({(bp / 100).toFixed(2).replace('.', ',')}%)
				</span>
				<span className="v">{kop(q.fee)}</span>
				<span className="k">
					{side === 'buy' ? 'Итого к списанию' : 'Итого к получению'}
				</span>
				<span className="v">
					<b>{kop(q.total)}</b>
				</span>
				<span className="k">{side === 'buy' ? 'Свободно' : 'В портфеле'}</span>
				<span className="v">
					{side === 'buy' ? kop(g.cash) : `${fmtUnits(held)} ${coin.ticker}`}
				</span>
			</div>
			{(problem || error) && (
				<div className="alert err">{problem ?? error}</div>
			)}
			<button
				className={'btn block ' + (side === 'buy' ? 'buy' : 'sell')}
				disabled={!!problem || u <= 0}
				onClick={() => setConfirm(true)}
			>
				{side === 'buy' ? 'Купить' : 'Продать'} {coin.ticker}
			</button>
			{confirm && (
				<Modal
					title={`Подтвердите ${side === 'buy' ? 'покупку' : 'продажу'}`}
					onClose={() => setConfirm(false)}
					actions={
						<>
							<button
								className="btn"
								onClick={() => setConfirm(false)}
							>
								Отмена
							</button>
							<button
								className={'btn ' + (side === 'buy' ? 'buy' : 'sell')}
								onClick={execute}
							>
								Подтвердить
							</button>
						</>
					}
				>
					<div className="kv">
						<span className="k">Монета</span>
						<span className="v">
							{coin.name} ({coin.ticker})
						</span>
						<span className="k">Цена</span>
						<span className="v">{priceStr(cs.price)} ₽</span>
						<span className="k">Количество</span>
						<span className="v">{fmtUnits(u)}</span>
						<span className="k">Сумма сделки</span>
						<span className="v">{kop(grossFor(u, priceKop))}</span>
						<span className="k">Комиссия</span>
						<span className="v">{kop(feeFor(grossFor(u, priceKop), bp))}</span>
						<span className="k">
							{side === 'buy' ? 'Итого к списанию' : 'Итого к получению'}
						</span>
						<span className="v">
							<b>{kop(q.total)}</b>
						</span>
					</div>
					<p
						className="dim small"
						style={{ marginTop: 10 }}
					>
						Сделка исполняется по цене на момент подтверждения.
					</p>
				</Modal>
			)}
		</div>
	)
}
