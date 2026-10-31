import { UNIT } from './constants'

export function mulDiv(a: number, b: number, d: number): number {
	const num =
		BigInt(Math.round(a)) * BigInt(Math.round(b)) + BigInt(Math.floor(d / 2))
	return Number(num / BigInt(d))
}

export const quoteKop = (price: number): number =>
	Math.max(1, Math.round(price * 100))
export const grossFor = (units: number, priceKop: number): number =>
	mulDiv(units, priceKop, UNIT)
export const feeFor = (gross: number, bp: number): number =>
	mulDiv(gross, bp, 10000)

export function unitsForBudget(
	budget: number,
	priceKop: number,
	bp: number
): number {
	if (budget <= 0 || priceKop <= 0) return 0
	const num = BigInt(Math.round(budget)) * BigInt(UNIT) * 10000n
	const den = BigInt(priceKop) * BigInt(10000 + bp)
	let u = Number(num / den)
	const total = (x: number): number => {
		const g = grossFor(x, priceKop)
		return g + feeFor(g, bp)
	}
	while (u > 0 && total(u) > budget) u--
	for (let i = 0; i < 4 && total(u + 1) <= budget; i++) u++
	return u
}

export function unitsForGross(amount: number, priceKop: number): number {
	if (amount <= 0 || priceKop <= 0) return 0
	return Number((BigInt(Math.round(amount)) * BigInt(UNIT)) / BigInt(priceKop))
}

export interface Quote {
	units: number
	priceKop: number
	gross: number
	fee: number
	total: number
}

export function quoteBuy(units: number, priceKop: number, bp: number): Quote {
	const gross = grossFor(units, priceKop)
	const fee = feeFor(gross, bp)
	return { units, priceKop, gross, fee, total: gross + fee }
}

export function quoteSell(units: number, priceKop: number, bp: number): Quote {
	const gross = grossFor(units, priceKop)
	const fee = feeFor(gross, bp)
	return { units, priceKop, gross, fee, total: gross - fee }
}
