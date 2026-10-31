import { ReactNode, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { dirClass, pct } from './format'
import { audio } from '../audio/engine'

export function Panel(props: {
	title?: ReactNode
	actions?: ReactNode
	children: ReactNode
	flush?: boolean
	className?: string
}) {
	return (
		<section className={'panel ' + (props.className ?? '')}>
			{(props.title || props.actions) && (
				<div className="panel-h">
					<h3>{props.title}</h3>
					<div className="row right wrap">{props.actions}</div>
				</div>
			)}
			<div className={'panel-b' + (props.flush ? ' flush' : '')}>
				{props.children}
			</div>
		</section>
	)
}

export function Kpi(props: {
	label: string
	value: ReactNode
	sub?: ReactNode
	cls?: string
}) {
	return (
		<div className="panel kpi">
			<div className="l">{props.label}</div>
			<div className={'v ' + (props.cls ?? '')}>{props.value}</div>
			{props.sub !== undefined && <div className="s">{props.sub}</div>}
		</div>
	)
}

export function Delta({ v }: { v: number }) {
	return <span className={dirClass(v)}>{pct(v)}</span>
}

export function Seg<T extends string | number>(props: {
	value: T
	options: { v: T; l: string }[]
	onChange: (v: T) => void
}) {
	return (
		<div className="seg">
			{props.options.map(o => (
				<button
					key={String(o.v)}
					className={o.v === props.value ? 'on' : ''}
					onClick={() => {
						audio.play('click')
						props.onChange(o.v)
					}}
				>
					{o.l}
				</button>
			))}
		</div>
	)
}

export function Modal(props: {
	title: string
	children: ReactNode
	onClose: () => void
	actions?: ReactNode
	wide?: boolean
}) {
	useEffect(() => {
		const h = (e: KeyboardEvent) => {
			if (e.key === 'Escape') props.onClose()
		}
		window.addEventListener('keydown', h)
		return () => window.removeEventListener('keydown', h)
	}, [props])
	return (
		<div
			className="overlay"
			onMouseDown={e => e.target === e.currentTarget && props.onClose()}
		>
			<div
				className={'modal' + (props.wide ? ' wide' : '')}
				role="dialog"
				aria-modal="true"
			>
				<div className="modal-h">{props.title}</div>
				<div className="modal-b">{props.children}</div>
				<div className="modal-f">{props.actions}</div>
			</div>
		</div>
	)
}

export function Field(props: {
	label: string
	hint?: string
	children: ReactNode
	full?: boolean
}) {
	return (
		<div className={'field' + (props.full ? ' full' : '')}>
			<span className="lab">{props.label}</span>
			{props.children}
			{props.hint && <span className="hint">{props.hint}</span>}
		</div>
	)
}

export function usePriceFlash(value: number): string {
	const prev = useRef(value)
	const [cls, setCls] = useState('')
	useEffect(() => {
		if (value !== prev.current) {
			setCls(value > prev.current ? 'flash-up' : 'flash-down')
			prev.current = value
			const t = window.setTimeout(() => setCls(''), 900)
			return () => window.clearTimeout(t)
		}
	}, [value])
	return cls
}

export function Spark({ data, color }: { data: number[]; color?: string }) {
	if (data.length < 2)
		return (
			<svg
				width="84"
				height="26"
			/>
		)
	const lo = Math.min(...data)
	const hi = Math.max(...data)
	const span = hi - lo || 1
	const pts = data
		.map(
			(v, i) => `${(i / (data.length - 1)) * 84},${24 - ((v - lo) / span) * 22}`
		)
		.join(' ')
	const up = data[data.length - 1] >= data[0]
	return (
		<svg
			width="84"
			height="26"
			viewBox="0 0 84 26"
			aria-hidden="true"
		>
			<polyline
				points={pts}
				fill="none"
				stroke={color ?? (up ? 'var(--up)' : 'var(--down)')}
				strokeWidth="1.4"
			/>
		</svg>
	)
}

export function Importance({ n }: { n: number }) {
	return (
		<span
			className="imp"
			title={
				n === 3
					? 'Высокая важность'
					: n === 2
						? 'Средняя важность'
						: 'Низкая важность'
			}
		>
			<i className={n >= 1 ? 'on' : ''} />
			<i className={n >= 2 ? 'on' : ''} />
			<i className={n >= 3 ? 'on' : ''} />
		</span>
	)
}

export function SentimentTag({ s }: { s: 'pos' | 'neg' | 'neu' }) {
	return (
		<span className={'tag ' + s}>
			{s === 'pos' ? 'Позитивное' : s === 'neg' ? 'Негативное' : 'Нейтральное'}
		</span>
	)
}

export function Toasts() {
	const toasts = useStore(s => s.toasts)
	const dismiss = useStore(s => s.dismissToast)
	const openNews = useStore(s => s.openNews)
	return (
		<div
			className="toasts"
			aria-live="polite"
		>
			{toasts.map(t => (
				<div
					key={t.id}
					className={
						'toast ' + (t.kind === 'error' ? 'error' : (t.sentiment ?? ''))
					}
					onClick={() => {
						dismiss(t.id)
						if (t.kind === 'news') openNews(null)
					}}
				>
					<b>{t.title}</b>
					{t.text && <span className="muted small">{t.text}</span>}
				</div>
			))}
		</div>
	)
}
