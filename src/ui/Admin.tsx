import { ReactNode, useState } from 'react'
import { admin, useGame, useStore } from '../store/store'
import {
	GameEvent,
	GameState,
	NewsItem,
	Phase,
	RegimeKind,
	Shape
} from '../engine/types'
import { TPD } from '../engine/constants'
import { eventsStartingBetween } from '../engine/events'
import { simulateFuture } from '../engine/game'
import { PHASES, segmentsUpTo } from '../engine/schedule'
import { REGIME_LABELS } from '../engine/market'
import { clamp } from '../engine/prng'
import {
	fmtDateTime,
	fromInputValue,
	toInputValue,
	fmtDuration
} from '../engine/time'
import { Field, Modal, Panel } from './common'
import { kop, parseDecimal, parseFloatRu, pct, priceStr } from './format'
import { randomSeed } from '../store/store'

type Tab =
	| 'coins'
	| 'events'
	| 'news'
	| 'future'
	| 'economy'
	| 'market'
	| 'game'
	| 'log'
const TABS: { v: Tab; l: string }[] = [
	{ v: 'coins', l: 'Монеты' },
	{ v: 'events', l: 'События' },
	{ v: 'news', l: 'Новости' },
	{ v: 'future', l: 'Будущее' },
	{ v: 'economy', l: 'Экономика' },
	{ v: 'market', l: 'Рынок' },
	{ v: 'game', l: 'Игра и seed' },
	{ v: 'log', l: 'Журнал' }
]
const SHAPES: { v: Shape; l: string }[] = [
	{ v: 'shock', l: 'Резкий скачок' },
	{ v: 'spike', l: 'Всплеск и откат' },
	{ v: 'ramp', l: 'Плавное движение' },
	{ v: 'sustained', l: 'Устойчивый тренд' }
]

function useRun() {
	const mutate = useStore(s => s.mutate)
	const [err, setErr] = useState<string | null>(null)
	const [ok, setOk] = useState<string | null>(null)
	const run = (
		fn: (g: GameState) => string | null | void,
		okText = 'Сохранено'
	): boolean => {
		const out = { e: null as string | null }
		mutate(g => {
			const r = fn(g)
			if (typeof r === 'string') out.e = r
		})
		setErr(out.e)
		setOk(out.e ? null : okText)
		return out.e === null
	}
	const msg = (
		<>
			{err && <div className="alert err">{err}</div>}
			{ok && !err && <div className="alert small">{ok}</div>}
		</>
	)
	return { run, msg, setErr, setOk }
}

function Lock() {
	const unlock = useStore(s => s.unlockAdmin)
	const [pw, setPw] = useState('')
	const [err, setErr] = useState<string | null>(null)
	const submit = () => {
		const r = unlock(pw)
		if (r === 'unset')
			setErr(
				'Хеш пароля не задан. Вставьте MD5-хеш в константу ADMIN_PASSWORD_MD5 в файле src/config/admin.ts и перезапустите приложение.'
			)
		else if (r === 'bad') setErr('Неверный пароль.')
		setPw('')
	}
	return (
		<div style={{ maxWidth: 420, margin: '40px auto' }}>
			<Panel title="Админ-панель">
				<div className="stack">
					<p className="muted small">Только если ты знаешь пароль :)</p>
					<Field label="Пароль">
						<input
							className="input"
							type="password"
							value={pw}
							onChange={e => setPw(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && submit()}
							autoFocus
						/>
					</Field>
					{err && <div className="alert err">{err}</div>}
					<button
						className="btn primary"
						onClick={submit}
					>
						Войти
					</button>
				</div>
			</Panel>
		</div>
	)
}

export function Admin() {
	const ok = useStore(s => s.adminOk)
	const lock = useStore(s => s.lockAdmin)
	const [tab, setTab] = useState<Tab>('coins')
	if (!ok) return <Lock />
	return (
		<div className="stack">
			<div className="row">
				<div className="tabs grow">
					{TABS.map(t => (
						<button
							key={t.v}
							className={tab === t.v ? 'on' : ''}
							onClick={() => setTab(t.v)}
						>
							{t.l}
						</button>
					))}
				</div>
				<button
					className="btn sm"
					onClick={lock}
				>
					Заблокировать
				</button>
			</div>
			{tab === 'coins' && <CoinsTab />}
			{tab === 'events' && <EventsTab />}
			{tab === 'news' && <NewsTab />}
			{tab === 'future' && <FutureTab />}
			{tab === 'economy' && <EconomyTab />}
			{tab === 'market' && <MarketTab />}
			{tab === 'game' && <GameTab />}
			{tab === 'log' && <LogTab />}
		</div>
	)
}

interface CoinForm {
	name: string
	ticker: string
	price: string
	vol: string
	drift: string
	beta: string
	volume: string
	color: string
	desc: string
}
const emptyCoin: CoinForm = {
	name: '',
	ticker: '',
	price: '100',
	vol: '5',
	drift: '0.03',
	beta: '1',
	volume: '20',
	color: '#7aa874',
	desc: ''
}

function CoinsTab() {
	const g = useGame()
	const { run, msg, setErr, setOk } = useRun()
	const [editId, setEditId] = useState<string | null>(null)
	const [f, setF] = useState<CoinForm>(emptyCoin)
	const [del, setDel] = useState<string | null>(null)
	const set = (k: keyof CoinForm) => (e: { target: { value: string } }) =>
		setF({ ...f, [k]: e.target.value })

	const edit = (id: string) => {
		const c = g.coins.find(x => x.id === id)
		if (!c) return
		setEditId(id)
		setF({
			name: c.name,
			ticker: c.ticker,
			price: String(c.startPrice),
			vol: String(c.volatility * 100),
			drift: String(c.drift * 100),
			beta: String(c.beta),
			volume: String(c.baseVolume / 1e6),
			color: c.color,
			desc: c.description
		})
		setErr(null)
		setOk(null)
	}
	const input = () => ({
		name: f.name,
		ticker: f.ticker.trim().toUpperCase(),
		startPrice: parseFloatRu(f.price),
		volatility: parseFloatRu(f.vol) / 100,
		drift: parseFloatRu(f.drift) / 100,
		beta: parseFloatRu(f.beta),
		baseVolume: parseFloatRu(f.volume) * 1e6,
		color: f.color,
		description: f.desc
	})
	const save = () => {
		const done = run(
			gg =>
				editId
					? admin.updateCoin(gg, editId, input())
					: admin.addCoin(gg, input()),
			editId ? 'Параметры монеты обновлены' : 'Монета добавлена'
		)
		if (done) {
			setEditId(null)
			setF(emptyCoin)
		}
	}
	return (
		<div className="grid g-main">
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
								<th className="num">Волатильность/день</th>
								<th className="num">Дрейф/день</th>
								<th className="num">Бета</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{g.coins.map(c => (
								<tr key={c.id}>
									<td>
										<span
											className="dot"
											style={{ background: c.color }}
										/>{' '}
										<b>{c.ticker}</b> <span className="muted">{c.name}</span>
									</td>
									<td className="num">{priceStr(g.markets[c.id].price)} ₽</td>
									<td className="num">
										{(c.volatility * 100).toFixed(2).replace('.', ',')}%
									</td>
									<td className="num">
										{(c.drift * 100).toFixed(3).replace('.', ',')}%
									</td>
									<td className="num">{c.beta}</td>
									<td className="num">
										<button
											className="btn sm"
											onClick={() => edit(c.id)}
										>
											Изменить
										</button>{' '}
										<button
											className="btn sm danger"
											onClick={() => setDel(c.id)}
										>
											Удалить
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Panel>
			<Panel title={editId ? 'Редактирование монеты' : 'Новая монета'}>
				<div className="stack">
					<div className="form-grid">
						<Field label="Название">
							<input
								className="input"
								value={f.name}
								onChange={set('name')}
							/>
						</Field>
						<Field label="Тикер">
							<input
								className="input"
								value={f.ticker}
								onChange={set('ticker')}
								maxLength={6}
							/>
						</Field>
						<Field
							label="Стартовая / опорная цена, ₽"
							hint="Минимум 1 ₽"
						>
							<input
								className="input"
								value={f.price}
								onChange={set('price')}
							/>
						</Field>
						<Field label="Волатильность, % в день">
							<input
								className="input"
								value={f.vol}
								onChange={set('vol')}
							/>
						</Field>
						<Field label="Дрейф, % в день">
							<input
								className="input"
								value={f.drift}
								onChange={set('drift')}
							/>
						</Field>
						<Field label="Чувствительность к рынку (бета)">
							<input
								className="input"
								value={f.beta}
								onChange={set('beta')}
							/>
						</Field>
						<Field label="Объём торгов, млн ₽ в сутки">
							<input
								className="input"
								value={f.volume}
								onChange={set('volume')}
							/>
						</Field>
						<Field label="Цвет">
							<input
								className="input"
								type="color"
								value={f.color}
								onChange={set('color')}
								style={{ padding: 2, height: 34 }}
							/>
						</Field>
						<Field
							label="Описание"
							full
						>
							<textarea
								className="input"
								value={f.desc}
								onChange={set('desc')}
							/>
						</Field>
					</div>
					{msg}
					<div className="row">
						<button
							className="btn primary"
							onClick={save}
						>
							{editId ? 'Сохранить' : 'Добавить монету'}
						</button>
						{editId && (
							<button
								className="btn"
								onClick={() => {
									setEditId(null)
									setF(emptyCoin)
								}}
							>
								Отмена
							</button>
						)}
					</div>
					<p className="dim small">
						Изменения параметров действуют на дальнейшую динамику и не
						переписывают историю цен.
					</p>
				</div>
			</Panel>
			{del && (
				<Modal
					title="Удалить монету?"
					onClose={() => setDel(null)}
					actions={
						<>
							<button
								className="btn"
								onClick={() => setDel(null)}
							>
								Отмена
							</button>
							<button
								className="btn danger"
								onClick={() => {
									run(gg => admin.removeCoin(gg, del), 'Монета удалена')
									setDel(null)
								}}
							>
								Удалить
							</button>
						</>
					}
				>
					<p>
						Монета и её история будут удалены. Если у игрока есть позиция, она
						будет продана по рыночной цене без комиссии.
					</p>
				</Modal>
			)}
		</div>
	)
}

interface EvForm {
	start: string
	days: string
	strength: string
	shape: Shape
	impacts: Record<string, string>
	news: boolean
	head: string
	body: string
	lead: string
}

function EventsTab() {
	const g = useGame()
	const { run, msg, setErr, setOk } = useRun()
	const blank = (): EvForm => ({
		start: toInputValue(g.tick + 90),
		days: '1',
		strength: '10',
		shape: 'ramp',
		impacts: Object.fromEntries(g.coins.map(c => [c.id, '0'])),
		news: true,
		head: '',
		body: '',
		lead: '0'
	})
	const [f, setF] = useState<EvForm>(blank)
	const [editing, setEditing] = useState<string | null>(null)
	const [span, setSpan] = useState(14)
	const list = eventsStartingBetween(g, g.tick - 2 * TPD, g.tick + span * TPD)

	const edit = (ev: GameEvent) => {
		const max = Math.max(...Object.values(ev.impacts).map(Math.abs), 0.0001)
		setEditing(ev.id)
		setF({
			start: toInputValue(ev.startTick),
			days: String(Math.round((ev.duration / TPD) * 100) / 100),
			strength: String(Math.round(max * 1000) / 10),
			shape: ev.shape,
			impacts: Object.fromEntries(
				g.coins.map(c => [
					c.id,
					String(Math.round(((ev.impacts[c.id] ?? 0) / max) * 100))
				])
			),
			news: ev.headline !== '',
			head: ev.headline,
			body: ev.body,
			lead: String(Math.round(((ev.startTick - ev.newsTick) / 15) * 10) / 10)
		})
		setErr(null)
		setOk(null)
	}

	const save = () => {
		const start = fromInputValue(f.start)
		const days = parseFloatRu(f.days)
		const strength = parseFloatRu(f.strength)
		const lead = parseFloatRu(f.lead)
		if (start === null) return setErr('Укажите дату и время начала.')
		if (!(days >= 0.05 && days <= 14))
			return setErr('Длительность: от 0,05 до 14 дней.')
		if (!(strength > 0 && strength <= 100))
			return setErr('Сила: от 0 до 100% (максимальное изменение цены).')
		if (!(lead >= 0 && lead <= 72))
			return setErr('Опережение новости: от 0 до 72 игровых часов.')
		const impacts: Record<string, number> = {}
		for (const c of g.coins) {
			const inf = parseFloatRu(f.impacts[c.id] ?? '0')
			if (!Number.isFinite(inf) || Math.abs(inf) > 100)
				return setErr('Влияние на монету: от −100 до 100.')
			if (inf !== 0)
				impacts[c.id] = clamp((strength / 100) * (inf / 100), -0.6, 1.5)
		}
		if (Object.keys(impacts).length === 0)
			return setErr('Задайте влияние хотя бы на одну монету.')
		if (f.news && !f.head.trim())
			return setErr('Укажите заголовок новости или отключите публикацию.')
		const maxAbs = Math.max(...Object.values(impacts).map(Math.abs))
		const sum = Object.values(impacts).reduce((a, b) => a + b, 0)
		run(gg => {
			const ev: GameEvent = {
				id:
					editing && gg.customEvents.some(e => e.id === editing)
						? editing
						: admin.newId(gg, 'c'),
				source: 'admin',
				scope:
					Object.keys(impacts).length === gg.coins.length && gg.coins.length > 1
						? 'macro'
						: 'coin',
				tpl: 'admin',
				startTick: start,
				newsTick: Math.max(0, start - Math.round(lead * 15)),
				duration: Math.round(days * TPD),
				shape: f.shape,
				strength: clamp(maxAbs / 0.3, 0, 1),
				impacts,
				headline: f.news ? f.head.trim() : '',
				body: f.news ? f.body.trim() : '',
				importance: maxAbs < 0.05 ? 1 : maxAbs < 0.14 ? 2 : 3,
				sentiment: Math.abs(sum) < 0.01 ? 'neu' : sum > 0 ? 'pos' : 'neg'
			}
			admin.saveEvent(gg, ev, editing ?? undefined)
		}, 'Событие сохранено')
		setEditing(null)
		setF(blank())
	}

	return (
		<div className="grid g-main">
			<Panel
				title="Расписание событий"
				actions={
					<select
						className="input"
						style={{ width: 'auto' }}
						value={span}
						onChange={e => setSpan(Number(e.target.value))}
					>
						{[3, 7, 14, 30].map(d => (
							<option
								key={d}
								value={d}
							>
								{d} дн. вперёд
							</option>
						))}
					</select>
				}
				flush
			>
				<div className="scroll-x">
					<table className="t">
						<thead>
							<tr>
								<th>Начало</th>
								<th>Событие</th>
								<th>Влияние</th>
								<th className="num">Длит.</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{list.map(ev => {
								const past = ev.startTick < g.tick
								return (
									<tr
										key={ev.id}
										style={past ? { opacity: 0.55 } : undefined}
									>
										<td className="muted">
											{fmtDateTime(ev.startTick)}
											{past && <div className="small">идёт или прошло</div>}
										</td>
										<td>
											<div>
												{ev.headline || (
													<i className="muted">Скрытое событие без новости</i>
												)}
											</div>
											<span className="tag">
												{ev.source === 'admin' ? 'админ' : 'генерация'}
											</span>{' '}
											<span className="tag">
												{SHAPES.find(s => s.v === ev.shape)?.l}
											</span>
										</td>
										<td className="small">
											{Object.entries(ev.impacts).map(([id, v]) => {
												const c = g.coins.find(x => x.id === id)
												return c ? (
													<div key={id}>
														{c.ticker}:{' '}
														<span className={v >= 0 ? 'up' : 'down'}>
															{pct(v)}
														</span>
													</div>
												) : null
											})}
										</td>
										<td className="num">{fmtDuration(ev.duration)}</td>
										<td className="num">
											<button
												className="btn sm"
												onClick={() => edit(ev)}
											>
												Изменить
											</button>{' '}
											<button
												className="btn sm danger"
												onClick={() =>
													run(
														gg => admin.deleteEvent(gg, ev.id),
														'Событие удалено'
													)
												}
											>
												Удалить
											</button>
										</td>
									</tr>
								)
							})}
							{list.length === 0 && (
								<tr>
									<td
										colSpan={5}
										className="empty"
									>
										Событий в этом окне нет.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</Panel>
			<Panel title={editing ? 'Редактирование события' : 'Новое событие'}>
				<div className="stack">
					<div className="form-grid">
						<Field label="Начало (игровое время)">
							<input
								className="input"
								type="datetime-local"
								value={f.start}
								onChange={e => setF({ ...f, start: e.target.value })}
							/>
						</Field>
						<Field label="Длительность, дней">
							<input
								className="input"
								value={f.days}
								onChange={e => setF({ ...f, days: e.target.value })}
							/>
						</Field>
						<Field label="Сила, % (макс. изменение цены)">
							<input
								className="input"
								value={f.strength}
								onChange={e => setF({ ...f, strength: e.target.value })}
							/>
						</Field>
						<Field label="Характер движения">
							<select
								className="input"
								value={f.shape}
								onChange={e => setF({ ...f, shape: e.target.value as Shape })}
							>
								{SHAPES.map(s => (
									<option
										key={s.v}
										value={s.v}
									>
										{s.l}
									</option>
								))}
							</select>
						</Field>
					</div>
					<div className="lab muted small">
						Влияние на монеты, от −100 до 100 (% от силы; минус — падение)
					</div>
					<div className="form-grid">
						{g.coins.map(c => (
							<Field
								key={c.id}
								label={c.ticker}
							>
								<input
									className="input"
									value={f.impacts[c.id] ?? '0'}
									onChange={e =>
										setF({
											...f,
											impacts: { ...f.impacts, [c.id]: e.target.value }
										})
									}
								/>
							</Field>
						))}
					</div>
					<label className="row">
						<input
							type="checkbox"
							checked={f.news}
							onChange={e => setF({ ...f, news: e.target.checked })}
						/>{' '}
						Опубликовать новость об этом событии
					</label>
					{f.news && (
						<>
							<Field label="Заголовок">
								<input
									className="input"
									value={f.head}
									onChange={e => setF({ ...f, head: e.target.value })}
								/>
							</Field>
							<Field label="Текст">
								<textarea
									className="input"
									value={f.body}
									onChange={e => setF({ ...f, body: e.target.value })}
								/>
							</Field>
							<Field
								label="Опережение новости, игровых часов"
								hint="0 — новость выходит в момент начала события"
							>
								<input
									className="input"
									value={f.lead}
									onChange={e => setF({ ...f, lead: e.target.value })}
								/>
							</Field>
						</>
					)}
					{msg}
					<div className="row">
						<button
							className="btn primary"
							onClick={save}
						>
							{editing ? 'Сохранить' : 'Создать событие'}
						</button>
						{editing && (
							<button
								className="btn"
								onClick={() => {
									setEditing(null)
									setF(blank())
								}}
							>
								Отмена
							</button>
						)}
					</div>
					<p className="dim small">
						Изменение сгенерированного события создаёт его копию, а оригинал
						отключается.
					</p>
				</div>
			</Panel>
		</div>
	)
}

function NewsTab() {
	const g = useGame()
	const { run, msg, setErr } = useRun()
	const blank = () => ({
		when: toInputValue(g.tick),
		head: '',
		body: '',
		coins: [] as string[],
		market: false,
		sent: 'neu' as NewsItem['sentiment'],
		imp: 1 as 1 | 2 | 3
	})
	const [f, setF] = useState(blank)
	const [editing, setEditing] = useState<string | null>(null)
	const [limit, setLimit] = useState(40)
	const all = [
		...g.customNews.filter(n => !g.news.some(x => x.id === n.id)),
		...g.news
	].sort((a, b) => b.tick - a.tick)
	const edit = (n: NewsItem) => {
		setEditing(n.id)
		setF({
			when: toInputValue(n.tick),
			head: n.headline,
			body: n.body,
			coins: n.coinIds,
			market: n.market,
			sent: n.sentiment,
			imp: n.importance
		})
	}
	const save = () => {
		const tick = fromInputValue(f.when)
		if (tick === null) return setErr('Укажите дату и время публикации.')
		if (!f.head.trim()) return setErr('Укажите заголовок.')
		run(gg => {
			const existing = editing
				? (gg.news.find(n => n.id === editing) ??
					gg.customNews.find(n => n.id === editing))
				: undefined
			const item: NewsItem = {
				id: editing ?? admin.newId(gg, 'n'),
				tick:
					existing && gg.news.some(n => n.id === existing.id)
						? existing.tick
						: tick,
				headline: f.head.trim(),
				body: f.body.trim(),
				coinIds: f.coins,
				market: f.market,
				sentiment: f.sent,
				importance: f.imp,
				source: existing ? existing.source : 'admin',
				eventId: existing?.eventId
			}
			admin.saveNews(gg, item)
		}, 'Новость сохранена')
		setEditing(null)
		setF(blank())
	}
	return (
		<div className="grid g-main">
			<Panel
				title="Новости"
				flush
			>
				<div className="scroll-x">
					<table className="t">
						<thead>
							<tr>
								<th>Время</th>
								<th>Заголовок</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{all.slice(0, limit).map(n => (
								<tr key={n.id}>
									<td className="muted">
										{fmtDateTime(n.tick)}
										{n.tick > g.tick && (
											<div className="small">запланирована</div>
										)}
									</td>
									<td>
										{n.headline}{' '}
										<span className={'tag ' + n.sentiment}>
											{n.source === 'admin' ? 'админ' : 'генерация'}
										</span>
									</td>
									<td className="num">
										<button
											className="btn sm"
											onClick={() => edit(n)}
										>
											Изменить
										</button>{' '}
										<button
											className="btn sm danger"
											onClick={() =>
												run(gg => admin.deleteNews(gg, n.id), 'Новость удалена')
											}
										>
											Удалить
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{all.length > limit && (
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
			<Panel title={editing ? 'Редактирование новости' : 'Новая новость'}>
				<div className="stack">
					<Field label="Время публикации">
						<input
							className="input"
							type="datetime-local"
							value={f.when}
							onChange={e => setF({ ...f, when: e.target.value })}
							disabled={!!editing && g.news.some(n => n.id === editing)}
						/>
					</Field>
					<Field label="Заголовок">
						<input
							className="input"
							value={f.head}
							onChange={e => setF({ ...f, head: e.target.value })}
						/>
					</Field>
					<Field label="Текст">
						<textarea
							className="input"
							value={f.body}
							onChange={e => setF({ ...f, body: e.target.value })}
						/>
					</Field>
					<div className="row wrap">
						<label className="row">
							<input
								type="checkbox"
								checked={f.market}
								onChange={e => setF({ ...f, market: e.target.checked })}
							/>{' '}
							Весь рынок
						</label>
						{g.coins.map(c => (
							<label
								key={c.id}
								className="row"
							>
								<input
									type="checkbox"
									checked={f.coins.includes(c.id)}
									onChange={e =>
										setF({
											...f,
											coins: e.target.checked
												? [...f.coins, c.id]
												: f.coins.filter(x => x !== c.id)
										})
									}
								/>{' '}
								{c.ticker}
							</label>
						))}
					</div>
					<div className="form-grid">
						<Field label="Влияние">
							<select
								className="input"
								value={f.sent}
								onChange={e =>
									setF({ ...f, sent: e.target.value as NewsItem['sentiment'] })
								}
							>
								<option value="pos">Позитивное</option>
								<option value="neg">Негативное</option>
								<option value="neu">Нейтральное</option>
							</select>
						</Field>
						<Field label="Важность">
							<select
								className="input"
								value={f.imp}
								onChange={e =>
									setF({ ...f, imp: Number(e.target.value) as 1 | 2 | 3 })
								}
							>
								<option value={1}>Низкая</option>
								<option value={2}>Средняя</option>
								<option value={3}>Высокая</option>
							</select>
						</Field>
					</div>
					{msg}
					<div className="row">
						<button
							className="btn primary"
							onClick={save}
						>
							{editing ? 'Сохранить' : 'Опубликовать'}
						</button>
						{editing && (
							<button
								className="btn"
								onClick={() => {
									setEditing(null)
									setF(blank())
								}}
							>
								Отмена
							</button>
						)}
					</div>
					<p className="dim small">
						Новость сама по себе не двигает цену. Чтобы повлиять на котировки,
						создайте событие во вкладке «События».
					</p>
				</div>
			</Panel>
		</div>
	)
}

function FutureTab() {
	const g = useGame()
	const [coinId, setCoinId] = useState(g.coins[0]?.id ?? '')
	const [days, setDays] = useState(7)
	const coin = g.coins.find(c => c.id === coinId) ?? g.coins[0]
	if (!coin) return <div className="empty">Монет нет.</div>
	const path = simulateFuture(g, coin.id, days * TPD)
	const pts = path.filter((_, i) => i % 6 === 0)
	const all = [g.markets[coin.id].price, ...pts]
	const lo = Math.min(...all)
	const hi = Math.max(...all)
	const span = hi - lo || 1
	const d = all
		.map(
			(v, i) =>
				`${i === 0 ? 'M' : 'L'}${(i / (all.length - 1)) * 800},${210 - ((v - lo) / span) * 190}`
		)
		.join(' ')
	const end = path[path.length - 1] ?? g.markets[coin.id].price
	const upcoming = eventsStartingBetween(g, g.tick + 1, g.tick + days * TPD)
	const phases = segmentsUpTo(g.seed, g.tick + 120 * TPD).filter(
		s => s.end > g.tick && s.start < g.tick + 120 * TPD
	)
	return (
		<div className="stack">
			<Panel
				title="Сгенерированная динамика"
				actions={
					<>
						<select
							className="input"
							style={{ width: 'auto' }}
							value={coin.id}
							onChange={e => setCoinId(e.target.value)}
						>
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
							value={days}
							onChange={e => setDays(Number(e.target.value))}
						>
							{[3, 7, 14, 30].map(x => (
								<option
									key={x}
									value={x}
								>
									{x} дн.
								</option>
							))}
						</select>
					</>
				}
			>
				<div
					className="row gap-lg"
					style={{ marginBottom: 8 }}
				>
					<span className="muted">
						Сейчас {priceStr(g.markets[coin.id].price)} ₽ → через {days} дн.{' '}
						{priceStr(end)} ₽
					</span>
					<b className={end >= g.markets[coin.id].price ? 'up' : 'down'}>
						{pct(end / g.markets[coin.id].price - 1)}
					</b>
					<span className="muted small">
						Диапазон: {priceStr(lo)} – {priceStr(hi)} ₽
					</span>
				</div>
				<svg
					viewBox="0 0 800 220"
					width="100%"
					height="220"
					preserveAspectRatio="none"
					style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
				>
					<path
						d={d}
						fill="none"
						stroke="var(--acc)"
						strokeWidth="1.5"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				<p
					className="dim small"
					style={{ marginTop: 6 }}
				>
					Точный сценарий при текущих параметрах и событиях. Он изменится, если
					вы поменяете настройки, события или вручную скорректируете рынок.
				</p>
			</Panel>
			<div className="grid g2">
				<Panel
					title={`События на ${days} дн. вперёд`}
					flush
				>
					<div className="scroll-x">
						<table className="t">
							<tbody>
								{upcoming.map(ev => (
									<tr key={ev.id}>
										<td className="muted">{fmtDateTime(ev.startTick)}</td>
										<td>
											{ev.headline || <i className="muted">Скрытое событие</i>}
										</td>
										<td className="small">
											{Object.entries(ev.impacts)
												.map(
													([id, v]) =>
														`${g.coins.find(c => c.id === id)?.ticker ?? id} ${pct(v)}`
												)
												.join(', ')}
										</td>
									</tr>
								))}
								{upcoming.length === 0 && (
									<tr>
										<td className="empty">Событий нет.</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</Panel>
				<Panel
					title="Экономические фазы (скрыты от игрока)"
					flush
				>
					<table className="t">
						<tbody>
							{phases.map(s => (
								<tr key={s.start}>
									<td>{PHASES[s.phase].label}</td>
									<td className="muted">
										{fmtDateTime(Math.max(s.start, g.tick))}
									</td>
									<td className="muted">до {fmtDateTime(s.end)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Panel>
			</div>
		</div>
	)
}

function EconomyTab() {
	const g = useGame()
	const { run, msg, setErr } = useRun()
	const [cash, setCash] = useState(String(g.startingCash / 100))
	const [adj, setAdj] = useState('0')
	const [fee, setFee] = useState(String(g.settings.feeBp / 100))
	const [min, setMin] = useState(String(g.settings.minTrade / 100))
	const [spd, setSpd] = useState(String(g.settings.secondsPerDay))
	const [vm, setVm] = useState(String(g.settings.marketVolMult))
	const [dens, setDens] = useState(String(g.settings.eventDensity))
	const apply = () => {
		const feeV = parseFloatRu(fee)
		const minK = parseDecimal(min, 2)
		const spdV = parseFloatRu(spd)
		const vmV = parseFloatRu(vm)
		const dV = parseFloatRu(dens)
		if (!(feeV >= 0 && feeV <= 20)) return setErr('Комиссия: от 0 до 20%.')
		if (minK === null) return setErr('Некорректная минимальная сумма сделки.')
		if (!(spdV >= 30 && spdV <= 3600))
			return setErr('Длительность игрового дня: от 30 до 3600 секунд.')
		if (!(vmV >= 0.2 && vmV <= 3))
			return setErr('Множитель волатильности: от 0,2 до 3.')
		if (!(dV >= 0 && dV <= 3)) return setErr('Плотность событий: от 0 до 3.')
		run(
			gg =>
				admin.setSettings(gg, {
					feeBp: Math.round(feeV * 100),
					minTrade: minK,
					secondsPerDay: spdV,
					marketVolMult: vmV,
					eventDensity: dV
				}),
			'Настройки применены'
		)
	}
	const applyStart = () => {
		const k = parseDecimal(cash, 2)
		if (k === null || k < 100000)
			return setErr('Начальный баланс: не менее 1 000 ₽.')
		run(gg => admin.setStartingCash(gg, k), 'Начальный баланс сохранён')
	}
	const applyAdj = () => {
		const neg = adj.trim().startsWith('-') || adj.trim().startsWith('−')
		const k = parseDecimal(adj.replace(/[-−+]/g, ''), 2)
		if (k === null || k === 0)
			return setErr('Введите сумму, например 50000 или -10000.')
		run(gg => admin.adjustCash(gg, neg ? -k : k), 'Баланс игрока изменён')
	}
	return (
		<div className="grid g2">
			<Panel title="Баланс игрока">
				<div className="stack">
					<Field label="Начальный баланс для новых игр и сброса, ₽">
						<input
							className="input"
							value={cash}
							onChange={e => setCash(e.target.value)}
						/>
					</Field>
					<button
						className="btn"
						onClick={applyStart}
					>
						Сохранить начальный баланс
					</button>
					<div className="sep" />
					<div className="kv">
						<span className="k">Свободно сейчас</span>
						<span className="v">{kop(g.cash)}</span>
					</div>
					<Field
						label="Добавить или списать с текущего баланса, ₽"
						hint="Корректировка учитывается в базе для расчёта прибыли"
					>
						<input
							className="input"
							value={adj}
							onChange={e => setAdj(e.target.value)}
						/>
					</Field>
					<button
						className="btn"
						onClick={applyAdj}
					>
						Применить корректировку
					</button>
				</div>
			</Panel>
			<Panel title="Торговля и время">
				<div className="stack">
					<div className="form-grid">
						<Field label="Комиссия, %">
							<input
								className="input"
								value={fee}
								onChange={e => setFee(e.target.value)}
							/>
						</Field>
						<Field label="Минимальная сделка, ₽">
							<input
								className="input"
								value={min}
								onChange={e => setMin(e.target.value)}
							/>
						</Field>
						<Field
							label="Игровой день, секунд реального времени"
							hint="По умолчанию 360 (6 минут)"
						>
							<input
								className="input"
								value={spd}
								onChange={e => setSpd(e.target.value)}
							/>
						</Field>
						<Field label="Множитель волатильности рынка">
							<input
								className="input"
								value={vm}
								onChange={e => setVm(e.target.value)}
							/>
						</Field>
						<Field
							label="Плотность событий"
							hint="1 — обычная, 0 — без новых событий"
						>
							<input
								className="input"
								value={dens}
								onChange={e => setDens(e.target.value)}
							/>
						</Field>
					</div>
					<label className="row">
						<input
							type="checkbox"
							checked={g.settings.tradingEnabled}
							onChange={e =>
								run(
									gg =>
										admin.setSettings(gg, { tradingEnabled: e.target.checked }),
									'Режим торговли изменён'
								)
							}
						/>{' '}
						Торговля разрешена
					</label>
					{msg}
					<button
						className="btn primary"
						onClick={apply}
					>
						Применить
					</button>
				</div>
			</Panel>
		</div>
	)
}

function MarketTab() {
	const g = useGame()
	const { run, msg, setErr } = useRun()
	const [coinId, setCoinId] = useState(g.coins[0]?.id ?? '')
	const [price, setPrice] = useState('')
	const [kind, setKind] = useState<RegimeKind>('bull')
	const [days, setDays] = useState('3')
	const [phase, setPhase] = useState<Phase>('expansion')
	const [pdays, setPdays] = useState('7')
	const coin = g.coins.find(c => c.id === coinId) ?? g.coins[0]
	if (!coin) return <div className="empty">Монет нет.</div>
	const cs = g.markets[coin.id]
	return (
		<div className="grid g2">
			<Panel title="Ручная коррекция монеты">
				<div className="stack">
					<select
						className="input"
						value={coin.id}
						onChange={e => setCoinId(e.target.value)}
					>
						{g.coins.map(c => (
							<option
								key={c.id}
								value={c.id}
							>
								{c.ticker} — {priceStr(g.markets[c.id].price)} ₽
							</option>
						))}
					</select>
					<div className="kv small">
						<span className="k">Текущий режим</span>
						<span className="v">
							{REGIME_LABELS[cs.regime.kind]}, ещё {fmtDuration(cs.regime.left)}
						</span>
					</div>
					<Field label="Установить цену, ₽">
						<div className="row">
							<input
								className="input"
								value={price}
								onChange={e => setPrice(e.target.value)}
								placeholder={priceStr(cs.price)}
							/>
							<button
								className="btn"
								onClick={() =>
									run(
										gg => admin.setPrice(gg, coin.id, parseFloatRu(price)),
										'Цена изменена'
									)
								}
							>
								Применить
							</button>
						</div>
					</Field>
					<Field label="Принудительный режим движения">
						<div className="row">
							<select
								className="input"
								value={kind}
								onChange={e => setKind(e.target.value as RegimeKind)}
							>
								{(Object.keys(REGIME_LABELS) as RegimeKind[]).map(k => (
									<option
										key={k}
										value={k}
									>
										{REGIME_LABELS[k]}
									</option>
								))}
							</select>
							<input
								className="input"
								style={{ width: 80 }}
								value={days}
								onChange={e => setDays(e.target.value)}
							/>
							<button
								className="btn"
								onClick={() => {
									const d = parseFloatRu(days)
									if (!(d > 0 && d <= 30))
										return setErr('Срок режима: от 0 до 30 дней.')
									run(
										gg => admin.forceRegime(gg, coin.id, kind, d),
										'Режим задан'
									)
								}}
							>
								Задать
							</button>
						</div>
					</Field>
					{msg}
				</div>
			</Panel>
			<Panel title="Фаза экономики">
				<div className="stack">
					<div className="kv small">
						<span className="k">Принудительная фаза</span>
						<span className="v">
							{g.phaseOverride
								? `${PHASES[g.phaseOverride.phase].label}, до ${fmtDateTime(g.phaseOverride.until)}`
								: 'нет'}
						</span>
					</div>
					<Field label="Фаза и срок, дней">
						<div className="row">
							<select
								className="input"
								value={phase}
								onChange={e => setPhase(e.target.value as Phase)}
							>
								{(Object.keys(PHASES) as Phase[]).map(p => (
									<option
										key={p}
										value={p}
									>
										{PHASES[p].label}
									</option>
								))}
							</select>
							<input
								className="input"
								style={{ width: 80 }}
								value={pdays}
								onChange={e => setPdays(e.target.value)}
							/>
						</div>
					</Field>
					<div className="row">
						<button
							className="btn"
							onClick={() => {
								const d = parseFloatRu(pdays)
								if (!(d > 0 && d <= 60))
									return setErr('Срок фазы: от 0 до 60 дней.')
								run(gg => admin.forcePhase(gg, phase, d), 'Фаза задана')
							}}
						>
							Задать фазу
						</button>
						<button
							className="btn"
							onClick={() => run(gg => admin.clearPhase(gg), 'Фаза снята')}
						>
							Снять
						</button>
					</div>
					<p className="dim small">
						Настроение рынка меняется плавно в течение игрового дня.
					</p>
				</div>
			</Panel>
		</div>
	)
}

function GameTab() {
	const g = useGame()
	const replace = useStore(s => s.replaceGame)
	const exportFile = useStore(s => s.exportFile)
	const goMenu = useStore(s => s.goMenu)
	const [seed, setSeed] = useState(g.seed)
	const [confirm, setConfirm] = useState<'seed' | 'reset' | null>(null)
	const apply = () => {
		const s = confirm === 'seed' ? seed.trim() : g.seed
		if (!s) return
		replace(admin.rebuild(g, s))
		setConfirm(null)
	}
	return (
		<div className="grid g2">
			<Panel title="Seed вселенной">
				<div className="stack">
					<div className="kv small">
						<span className="k">Текущий seed</span>
						<span className="v">{g.seed}</span>
						<span className="k">Версия симуляции</span>
						<span className="v">{g.simVersion}</span>
						<span className="k">Игровое время</span>
						<span className="v">{fmtDateTime(g.tick)}</span>
					</div>
					<Field label="Новый seed">
						<div className="row">
							<input
								className="input"
								value={seed}
								onChange={e => setSeed(e.target.value)}
							/>
							<button
								className="btn"
								onClick={() => setSeed(randomSeed())}
							>
								Случайный
							</button>
						</div>
					</Field>
					<button
						className="btn danger"
						disabled={!seed.trim() || seed.trim() === g.seed}
						onClick={() => setConfirm('seed')}
					>
						Пересоздать вселенную
					</button>
				</div>
			</Panel>
			<Panel title="Сброс и сохранение">
				<div className="stack">
					<button
						className="btn danger"
						onClick={() => setConfirm('reset')}
					>
						Сбросить игру с тем же seed
					</button>
					<button
						className="btn"
						onClick={() => void goMenu()}
					>
						Начать новую игру в меню
					</button>
					<button
						className="btn"
						onClick={exportFile}
					>
						Экспортировать сохранение
					</button>
					<p className="dim small">
						Сброс и пересоздание удаляют историю цен, новости, события, сделки и
						портфель. Список монет, настройки и журнал администратора
						сохраняются.
					</p>
				</div>
			</Panel>
			{confirm && (
				<Modal
					title={
						confirm === 'seed' ? 'Пересоздать вселенную?' : 'Сбросить игру?'
					}
					onClose={() => setConfirm(null)}
					actions={
						<>
							<button
								className="btn"
								onClick={() => setConfirm(null)}
							>
								Отмена
							</button>
							<button
								className="btn danger"
								onClick={apply}
							>
								Подтвердить
							</button>
						</>
					}
				>
					<p>
						Весь текущий прогресс игрока будет потерян. Если игра привязана к
						файлу, он будет перезаписан новой игрой.
					</p>
				</Modal>
			)}
		</div>
	)
}

function LogTab(): ReactNode {
	const g = useGame()
	const rows = g.adminLog.slice().reverse()
	return (
		<Panel
			title="Журнал изменений администратора"
			flush
		>
			{rows.length === 0 ? (
				<div className="empty">Изменений пока не было.</div>
			) : (
				<table className="t">
					<tbody>
						{rows.map((r, i) => (
							<tr key={i}>
								<td
									className="muted"
									style={{ width: 150 }}
								>
									{fmtDateTime(r.tick)}
								</td>
								<td>{r.text}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</Panel>
	)
}
