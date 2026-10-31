import { EPOCH_MS, TICK_MS_GAME, TPD } from './constants'

export const tickToMs = (t: number): number => EPOCH_MS + t * TICK_MS_GAME
const p2 = (n: number): string => String(n).padStart(2, '0')

export function fmtDate(t: number): string {
	const d = new Date(tickToMs(t))
	return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

export function fmtTime(t: number): string {
	const d = new Date(tickToMs(t))
	return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
}

export const fmtDateTime = (t: number): string => `${fmtDate(t)} ${fmtTime(t)}`

export function fmtDM(t: number): string {
	const d = new Date(tickToMs(t))
	return `${p2(d.getUTCDate())}.${p2(d.getUTCMonth() + 1)} в ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
}

export function toInputValue(t: number): string {
	const d = new Date(tickToMs(t))
	return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
}

export function fromInputValue(s: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s)
	if (!m) return null
	const ms = Date.UTC(
		Number(m[1]),
		Number(m[2]) - 1,
		Number(m[3]),
		Number(m[4]),
		Number(m[5])
	)
	return Math.round((ms - EPOCH_MS) / TICK_MS_GAME)
}

export const gameDay = (t: number): number => Math.floor(t / TPD) + 1

export function fmtDuration(ticks: number): string {
	const minutes = ticks * 4
	if (minutes < 60) return `${minutes} мин`
	const hours = minutes / 60
	if (hours < 48) return `${Math.round(hours * 10) / 10} ч`
	return `${Math.round((hours / 24) * 10) / 10} дн`
}
