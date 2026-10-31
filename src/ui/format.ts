import { UNIT } from '../engine/constants'

const nf2 = new Intl.NumberFormat('ru-RU', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
})

export const kop = (k: number): string => nf2.format(k / 100) + ' ₽'
export const rub = (r: number): string => nf2.format(r) + ' ₽'
export const priceStr = (p: number): string =>
	nf2.format(Math.round(p * 100) / 100)
export const units = (u: number): string =>
	(u / UNIT).toLocaleString('ru-RU', { maximumFractionDigits: 6 })

export function pct(x: number): string {
	const s = Math.abs(x * 100)
		.toFixed(2)
		.replace('.', ',')
	return (x > 0.00005 ? '+' : x < -0.00005 ? '−' : '') + s + '%'
}

export function signedKop(k: number): string {
	return (k > 0 ? '+' : k < 0 ? '−' : '') + nf2.format(Math.abs(k) / 100) + ' ₽'
}

export function compactRub(r: number): string {
	if (r >= 1e9) return (r / 1e9).toFixed(2).replace('.', ',') + ' млрд ₽'
	if (r >= 1e6) return (r / 1e6).toFixed(2).replace('.', ',') + ' млн ₽'
	if (r >= 1e3) return (r / 1e3).toFixed(1).replace('.', ',') + ' тыс. ₽'
	return Math.round(r) + ' ₽'
}

export function parseDecimal(s: string, scale: number): number | null {
	const t = s.trim().replace(/\s/g, '').replace(',', '.')
	if (t === '' || t === '.' || !/^\d*\.?\d*$/.test(t)) return null
	const [i, f = ''] = t.split('.')
	if (f.length > scale) return null
	const v = Number(i || '0') * 10 ** scale + Number(f.padEnd(scale, '0') || '0')
	return Number.isSafeInteger(v) ? v : null
}

export const parseFloatRu = (s: string): number =>
	Number(s.trim().replace(/\s/g, '').replace(',', '.'))

export const dirClass = (v: number): string =>
	v > 0.00005 ? 'up' : v < -0.00005 ? 'down' : ''

export function ago(ms: number): string {
	const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
	if (s < 5) return 'только что'
	if (s < 60) return `${s} с назад`
	const m = Math.round(s / 60)
	if (m < 60) return `${m} мин назад`
	return `${Math.round(m / 60)} ч назад`
}
