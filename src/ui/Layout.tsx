import { ReactNode, useEffect, useRef, useState } from 'react'
import { useGame, useStore, View } from '../store/store'
import { equityOf } from '../engine/game'
import { fmtDate, fmtTime, gameDay } from '../engine/time'
import { Seg, Toasts } from './common'
import { ago, kop } from './format'
import { Dashboard } from './Dashboard'
import { Market } from './Market'
import { Trade } from './Trade'
import { News } from './News'
import { Portfolio } from './Portfolio'
import { Admin } from './Admin'

const icons: Record<View, ReactNode> = {
	dashboard: <path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z" />,
	market: <path d="M3 17l5-6 4 3 8-9M3 21h18" />,
	trade: <path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4" />,
	news: <path d="M4 5h14v14H4zM18 9h2v8a2 2 0 0 1-2 2M8 9h6M8 13h6" />,
	portfolio: <path d="M3 8h18v12H3zM8 8V5h8v3" />,
	admin: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
}

const labels: Record<View, string> = {
	dashboard: 'Главная',
	market: 'Рынок',
	trade: 'Торговля',
	news: 'Новости',
	portfolio: 'Портфель',
	admin: 'Админ'
}

function Icon({ v }: { v: View }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="square"
		>
			{icons[v]}
		</svg>
	)
}

function Pop(props: { label: ReactNode; children: ReactNode; title: string }) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!open) return
		const h = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
		}
		window.addEventListener('mousedown', h)
		return () => window.removeEventListener('mousedown', h)
	}, [open])
	return (
		<div
			className="pop-wrap"
			ref={ref}
		>
			<button
				className="btn"
				title={props.title}
				onClick={() => setOpen(!open)}
			>
				{props.label}
			</button>
			{open && <div className="popover">{props.children}</div>}
		</div>
	)
}

function SavePop() {
	const s = useStore()
	const g = useGame()
	return (
		<Pop
			title="Сохранение"
			label={
				<>
					<span className={'status-dot ' + s.save.state} />
					<span className="hide-s">
						{s.save.state === 'none'
							? 'Без файла'
							: s.save.state === 'error'
								? 'Ошибка'
								: s.save.state === 'saving'
									? 'Сохранение…'
									: 'Сохранено'}
					</span>
				</>
			}
		>
			<div className="stack sm">
				<div className="kv">
					<span className="k">Файл</span>
					<span className="v">{s.save.name ?? 'не выбран'}</span>
					<span className="k">Статус</span>
					<span className="v">{s.save.message}</span>
					<span className="k">Последнее</span>
					<span className="v">{s.save.at ? ago(s.save.at) : '—'}</span>
					<span className="k">Seed</span>
					<span className="v">{g.seed}</span>
				</div>
				{s.save.state === 'error' && (
					<div className="alert err small">
						Игра продолжается, запись будет повторена автоматически. Можно
						сделать экспорт вручную.
					</div>
				)}
				<div className="row wrap">
					{s.fsOk && (
						<button
							className="btn sm"
							onClick={() => void s.chooseSaveFile()}
						>
							{s.save.name ? 'Сменить файл' : 'Выбрать файл'}
						</button>
					)}
					<button
						className="btn sm"
						onClick={s.exportFile}
					>
						Экспорт
					</button>
				</div>
			</div>
		</Pop>
	)
}

function SoundPop() {
	const g = useGame()
	const set = useStore(s => s.setAudio)
	const a = g.audio
	const slider = (label: string, key: 'master' | 'music' | 'sfx') => (
		<label className="field">
			<span className="lab">
				{label}: {Math.round(a[key] * 100)}%
			</span>
			<input
				type="range"
				min={0}
				max={1}
				step={0.05}
				value={a[key]}
				onChange={e => set({ [key]: Number(e.target.value) })}
			/>
		</label>
	)
	return (
		<Pop
			title="Звук"
			label={
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.7"
				>
					<path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6" />
				</svg>
			}
		>
			<div className="stack sm">
				{slider('Общая громкость', 'master')}
				{slider('Музыка', 'music')}
				{slider('Эффекты', 'sfx')}
				<label className="row">
					<input
						type="checkbox"
						checked={a.musicOn}
						onChange={e => set({ musicOn: e.target.checked })}
					/>
					<span>Фоновая музыка</span>
				</label>
				<label className="row">
					<input
						type="checkbox"
						checked={a.sfxOn}
						onChange={e => set({ sfxOn: e.target.checked })}
					/>
					<span>Звуковые эффекты</span>
				</label>
			</div>
		</Pop>
	)
}

export function Layout() {
	const g = useGame()
	const view = useStore(s => s.view)
	const setView = useStore(s => s.setView)
	const setSpeed = useStore(s => s.setSpeed)
	const toggle = useStore(s => s.togglePause)
	const goMenu = useStore(s => s.goMenu)
	const views: View[] = [
		'dashboard',
		'market',
		'trade',
		'news',
		'portfolio',
		'admin'
	]
	return (
		<div className="app">
			<header className="topbar">
				<div className="brand">
					SD<span>coin</span>
				</div>
				<div className="clock">
					<b>
						{fmtDate(g.tick)} {fmtTime(g.tick)}
					</b>
					<small>
						День {gameDay(g.tick)}
						{g.paused ? ' · пауза' : ''}
					</small>
				</div>
				<button
					className="btn"
					onClick={toggle}
					style={{ width: 104 }}
				>
					{g.paused ? 'Продолжить' : 'Пауза'}
				</button>
				<Seg
					value={g.speed}
					options={[
						{ v: 0.5, l: '0,5×' },
						{ v: 1, l: '1×' },
						{ v: 2, l: '2×' }
					]}
					onChange={setSpeed}
				/>
				<div className="right row">
					<span className="hide-s muted">
						Капитал <b style={{ color: 'var(--text)' }}>{kop(equityOf(g))}</b>
					</span>
					<SavePop />
					<SoundPop />
					<button
						className="btn ghost"
						onClick={() => void goMenu()}
					>
						Меню
					</button>
				</div>
			</header>
			<nav className="sidebar">
				{views.map(v => (
					<button
						key={v}
						className={
							'nav' +
							(view === v ? ' active' : '') +
							(v === 'admin' ? ' bottom' : '')
						}
						onClick={() => setView(v)}
					>
						<Icon v={v} />
						{labels[v]}
					</button>
				))}
			</nav>
			<main className="content">
				<div
					className="view"
					key={view}
				>
					{view === 'dashboard' && <Dashboard />}
					{view === 'market' && <Market />}
					{view === 'trade' && <Trade />}
					{view === 'news' && <News />}
					{view === 'portfolio' && <Portfolio />}
					{view === 'admin' && <Admin />}
				</div>
			</main>
			<Toasts />
		</div>
	)
}
