import { useMemo, useState } from 'react'
import { useGame, useStore } from '../store/store'
import { TPD } from '../engine/constants'
import { fmtDateTime } from '../engine/time'
import { Importance, Panel, Seg, SentimentTag } from './common'

type Range = 'feed' | 'archive'

export function News() {
	const g = useGame()
	const newsId = useStore(s => s.newsId)
	const open = useStore(s => s.openNews)
	const select = useStore(s => s.selectCoin)
	const setView = useStore(s => s.setView)
	const [range, setRange] = useState<Range>('feed')
	const [coin, setCoin] = useState('all')
	const [sent, setSent] = useState<'all' | 'pos' | 'neg' | 'neu'>('all')
	const [imp, setImp] = useState(1)
	const [q, setQ] = useState('')
	const [limit, setLimit] = useState(60)

	const list = useMemo(() => {
		const cutoff = g.tick - 3 * TPD
		const ql = q.trim().toLowerCase()
		return g.news
			.filter(
				n =>
					(range === 'archive' || n.tick >= cutoff) &&
					(coin === 'all' || n.market || n.coinIds.includes(coin)) &&
					(sent === 'all' || n.sentiment === sent) &&
					n.importance >= imp &&
					(ql === '' ||
						n.headline.toLowerCase().includes(ql) ||
						n.body.toLowerCase().includes(ql))
			)
			.sort((a, b) => b.tick - a.tick || (a.id < b.id ? 1 : -1))
	}, [g.news.length, g.tick - (g.tick % 5), range, coin, sent, imp, q])

	const current = g.news.find(n => n.id === newsId) ?? list[0] ?? null

	return (
		<div
			className="grid g-main-l"
			style={{ alignItems: 'start' }}
		>
			<Panel
				title="Лента"
				actions={
					<Seg
						value={range}
						options={[
							{ v: 'feed', l: '3 дня' },
							{ v: 'archive', l: 'Архив' }
						]}
						onChange={v => {
							setRange(v)
							setLimit(60)
						}}
					/>
				}
				flush
			>
				<div
					className="panel-b stack sm"
					style={{ borderBottom: '1px solid var(--line)' }}
				>
					<input
						className="input"
						placeholder="Поиск по новостям"
						value={q}
						onChange={e => setQ(e.target.value)}
					/>
					<div className="row wrap">
						<select
							className="input"
							style={{ width: 'auto' }}
							value={coin}
							onChange={e => setCoin(e.target.value)}
						>
							<option value="all">Все монеты</option>
							{g.coins.map(c => (
								<option
									key={c.id}
									value={c.id}
								>
									{c.ticker}
								</option>
							))}
						</select>
						<select
							className="input"
							style={{ width: 'auto' }}
							value={sent}
							onChange={e => setSent(e.target.value as typeof sent)}
						>
							<option value="all">Любое влияние</option>
							<option value="pos">Позитивное</option>
							<option value="neg">Негативное</option>
							<option value="neu">Нейтральное</option>
						</select>
						<select
							className="input"
							style={{ width: 'auto' }}
							value={imp}
							onChange={e => setImp(Number(e.target.value))}
						>
							<option value={1}>Любая важность</option>
							<option value={2}>Средняя и выше</option>
							<option value={3}>Только высокая</option>
						</select>
					</div>
				</div>
				<div className="news-list">
					{list.length === 0 && (
						<div className="empty">Новостей по заданным условиям нет.</div>
					)}
					{list.slice(0, limit).map(n => (
						<button
							key={n.id}
							className={
								'news-item' + (current && current.id === n.id ? ' sel' : '')
							}
							onClick={() => open(n.id)}
						>
							<div className="row">
								<span className="muted small">{fmtDateTime(n.tick)}</span>
								<Importance n={n.importance} />
								<span
									className={'dot'}
									style={{
										background:
											n.sentiment === 'pos'
												? 'var(--up)'
												: n.sentiment === 'neg'
													? 'var(--down)'
													: 'var(--dim)'
									}}
								/>
							</div>
							<div className="hd">{n.headline}</div>
						</button>
					))}
					{list.length > limit && (
						<div className="panel-b">
							<button
								className="btn"
								onClick={() => setLimit(limit + 60)}
							>
								Показать ещё
							</button>
						</div>
					)}
				</div>
			</Panel>
			<Panel title="Публикация">
				{!current ? (
					<div className="empty">Выберите новость в ленте.</div>
				) : (
					<article className="stack">
						<div className="row wrap">
							<span className="muted">{fmtDateTime(current.tick)}</span>
							<SentimentTag s={current.sentiment} />
							<span className="row small muted">
								Важность <Importance n={current.importance} />
							</span>
						</div>
						<h2 style={{ fontSize: 21, lineHeight: 1.3, maxWidth: '40ch' }}>
							{current.headline}
						</h2>
						<p className="news-body">{current.body}</p>
						<div className="row wrap">
							<span className="muted small">Связанные монеты:</span>
							{current.market && <span className="tag acc">Весь рынок</span>}
							{!current.market && current.coinIds.length === 0 && (
								<span className="muted small">—</span>
							)}
							{!current.market &&
								current.coinIds.map(id => {
									const c = g.coins.find(x => x.id === id)
									return c ? (
										<button
											key={id}
											className="btn sm"
											onClick={() => {
												select(id)
												setView('market')
											}}
										>
											{c.ticker}
										</button>
									) : null
								})}
						</div>
					</article>
				)}
			</Panel>
		</div>
	)
}
