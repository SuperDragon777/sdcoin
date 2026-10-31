import { AudioSettings } from '../engine/types'

type Sfx = 'buy' | 'sell' | 'news' | 'alert' | 'click' | 'error' | 'toggle'

const CHORDS: number[][] = [
	[110, 164.81, 246.94, 261.63],
	[87.31, 130.81, 164.81, 220],
	[130.81, 196, 261.63, 329.63],
	[98, 146.83, 246.94, 293.66]
]
const TOPS = [440, 523.25, 587.33, 659.25, 783.99]

class AudioEngine {
	private ctx: AudioContext | null = null
	private master: GainNode | null = null
	private musicBus: GainNode | null = null
	private sfxBus: GainNode | null = null
	private settings: AudioSettings = {
		master: 0.7,
		music: 0.35,
		sfx: 0.7,
		musicOn: true,
		sfxOn: true
	}
	private musicTimer: number | null = null
	private step = 0
	private seed = 12345

	private rnd(): number {
		this.seed = (this.seed * 1664525 + 1013904223) >>> 0
		return this.seed / 4294967296
	}

	apply(s: AudioSettings): void {
		this.settings = { ...s }
		if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return
		const t = this.ctx.currentTime
		this.master.gain.setTargetAtTime(s.master, t, 0.05)
		this.musicBus.gain.setTargetAtTime(s.musicOn ? s.music * 0.45 : 0, t, 0.1)
		this.sfxBus.gain.setTargetAtTime(s.sfxOn ? s.sfx : 0, t, 0.05)
		if (s.musicOn && s.music > 0) this.startMusic()
		else this.stopMusic()
	}

	unlock(): void {
		if (!this.ctx) {
			const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
			if (!Ctor) return
			this.ctx = new Ctor() as AudioContext
			this.master = this.ctx.createGain()
			this.musicBus = this.ctx.createGain()
			this.sfxBus = this.ctx.createGain()
			this.musicBus.connect(this.master)
			this.sfxBus.connect(this.master)
			this.master.connect(this.ctx.destination)
		}
		if (this.ctx.state === 'suspended') void this.ctx.resume()
		this.apply(this.settings)
	}

	private tone(
		freq: number,
		start: number,
		dur: number,
		type: OscillatorType,
		vol: number,
		bus: GainNode
	): void {
		if (!this.ctx) return
		const o = this.ctx.createOscillator()
		const g = this.ctx.createGain()
		o.type = type
		o.frequency.value = freq
		g.gain.setValueAtTime(0.0001, start)
		g.gain.exponentialRampToValueAtTime(vol, start + 0.012)
		g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
		o.connect(g)
		g.connect(bus)
		o.start(start)
		o.stop(start + dur + 0.05)
	}

	play(name: Sfx): void {
		if (
			!this.ctx ||
			!this.sfxBus ||
			!this.settings.sfxOn ||
			this.ctx.state !== 'running'
		)
			return
		const t = this.ctx.currentTime
		const b = this.sfxBus
		switch (name) {
			case 'buy':
				this.tone(523.25, t, 0.16, 'triangle', 0.22, b)
				this.tone(783.99, t + 0.09, 0.26, 'triangle', 0.22, b)
				break
			case 'sell':
				this.tone(659.25, t, 0.14, 'triangle', 0.2, b)
				this.tone(440, t + 0.09, 0.26, 'triangle', 0.2, b)
				break
			case 'news':
				this.tone(880, t, 0.5, 'sine', 0.12, b)
				this.tone(1318.5, t + 0.04, 0.4, 'sine', 0.07, b)
				break
			case 'alert':
				this.tone(660, t, 0.18, 'sine', 0.14, b)
				this.tone(880, t + 0.14, 0.18, 'sine', 0.14, b)
				this.tone(1174.7, t + 0.28, 0.4, 'sine', 0.14, b)
				break
			case 'click':
				this.tone(1400, t, 0.035, 'square', 0.04, b)
				break
			case 'error':
				this.tone(170, t, 0.22, 'sawtooth', 0.09, b)
				this.tone(140, t + 0.1, 0.25, 'sawtooth', 0.09, b)
				break
			case 'toggle':
				this.tone(740, t, 0.07, 'triangle', 0.1, b)
				break
		}
	}

	private chord(): void {
		if (!this.ctx || !this.musicBus || this.ctx.state !== 'running') return
		const t = this.ctx.currentTime
		const notes = CHORDS[this.step % CHORDS.length]
		for (const f of notes) {
			const o = this.ctx.createOscillator()
			const g = this.ctx.createGain()
			const lp = this.ctx.createBiquadFilter()
			o.type = 'triangle'
			o.frequency.value = f
			o.detune.value = (this.rnd() - 0.5) * 8
			lp.type = 'lowpass'
			lp.frequency.value = 900
			g.gain.setValueAtTime(0.0001, t)
			g.gain.linearRampToValueAtTime(0.09, t + 2.2)
			g.gain.linearRampToValueAtTime(0.0001, t + 7.5)
			o.connect(lp)
			lp.connect(g)
			g.connect(this.musicBus)
			o.start(t)
			o.stop(t + 7.7)
		}
		if (this.rnd() < 0.7) {
			const f = TOPS[Math.floor(this.rnd() * TOPS.length)]
			const when = t + 1.5 + this.rnd() * 3
			this.tone(f, when, 2.6, 'sine', 0.05, this.musicBus)
		}
		this.step += 1
	}

	startMusic(): void {
		if (this.musicTimer !== null || !this.ctx) return
		this.chord()
		this.musicTimer = window.setInterval(() => this.chord(), 6000)
	}

	stopMusic(): void {
		if (this.musicTimer !== null) {
			window.clearInterval(this.musicTimer)
			this.musicTimer = null
		}
	}
}

export const audio = new AudioEngine()
export type { Sfx }
