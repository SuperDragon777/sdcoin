export function hashString(str: string): [number, number, number, number] {
	let h1 = 1779033703
	let h2 = 3144134277
	let h3 = 1013904242
	let h4 = 2773480762
	for (let i = 0; i < str.length; i++) {
		const k = str.charCodeAt(i)
		h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
		h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
		h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
		h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
	h1 ^= h2 ^ h3 ^ h4
	h2 ^= h1
	h3 ^= h1
	h4 ^= h1
	return [h1 | 0, h2 | 0, h3 | 0, h4 | 0]
}

export class Rng {
	private a: number
	private b: number
	private c: number
	private d: number

	constructor(s: ArrayLike<number>) {
		this.a = s[0] | 0
		this.b = s[1] | 0
		this.c = s[2] | 0
		this.d = s[3] | 0
	}

	static fromString(str: string): Rng {
		const r = new Rng(hashString(str))
		for (let i = 0; i < 15; i++) r.next()
		return r
	}

	static from(state: number[]): Rng {
		return new Rng(state)
	}

	next(): number {
		const a = this.a
		const b = this.b
		const c = this.c
		const d = this.d
		const t = (((a + b) | 0) + d) | 0
		this.d = (d + 1) | 0
		this.a = b ^ (b >>> 9)
		this.b = (c + (c << 3)) | 0
		const c2 = (c << 21) | (c >>> 11)
		this.c = (c2 + t) | 0
		return (t >>> 0) / 4294967296
	}

	range(lo: number, hi: number): number {
		return lo + (hi - lo) * this.next()
	}

	int(lo: number, hi: number): number {
		return lo + Math.floor(this.next() * (hi - lo + 1))
	}

	chance(p: number): boolean {
		return this.next() < p
	}

	pick<T>(arr: readonly T[]): T {
		return arr[Math.floor(this.next() * arr.length) % arr.length]
	}

	normal(): number {
		const u = 1 - this.next()
		const v = this.next()
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
	}

	weighted(weights: number[]): number {
		let total = 0
		for (const w of weights) total += w
		let x = this.next() * total
		for (let i = 0; i < weights.length; i++) {
			x -= weights[i]
			if (x < 0) return i
		}
		return weights.length - 1
	}

	snapshot(): number[] {
		return [this.a, this.b, this.c, this.d]
	}

	write(target: number[]): void {
		target[0] = this.a
		target[1] = this.b
		target[2] = this.c
		target[3] = this.d
	}
}

export function stream(seed: string, label: string): Rng {
	return Rng.fromString(seed + '\u0001' + label)
}

export const clamp = (v: number, lo: number, hi: number): number =>
	v < lo ? lo : v > hi ? hi : v
export const round2 = (v: number): number => Math.round(v * 100) / 100
