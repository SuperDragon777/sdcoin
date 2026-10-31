import { create } from 'zustand'
import SparkMD5 from 'spark-md5'
import {
	AudioSettings,
	GameState,
	Sentiment,
	TradeResult
} from '../engine/types'
import { TPD } from '../engine/constants'
import {
	createGame,
	deserialize,
	executeTrade,
	serialize,
	stepGame
} from '../engine/game'
import { ADMIN_PASSWORD_MD5 } from '../config/admin'
import { audio } from '../audio/engine'
import { idbDel, idbGet, idbSet } from '../services/idb'
import {
	FileHandle,
	SaveStatus,
	downloadText,
	ensurePermission,
	fsSupported,
	isAbort,
	pickNewFile,
	pickOpenFile,
	readHandle,
	saver
} from '../services/saveFile'
import * as admin from '../engine/admin'

export type View =
	| 'dashboard'
	| 'market'
	| 'trade'
	| 'news'
	| 'portfolio'
	| 'admin'

export interface Toast {
	id: number
	kind: 'news' | 'info' | 'error' | 'trade'
	title: string
	text?: string
	sentiment?: Sentiment
}

export interface NewGameOptions {
	seed: string
	startingCash: number
	useFile: boolean
}

interface Store {
	game: GameState | null
	rev: number
	view: View
	coinId: string
	newsId: string | null
	toasts: Toast[]
	save: SaveStatus
	fsOk: boolean
	adminOk: boolean
	booted: boolean
	resumeName: string | null
	startError: string | null
	busy: boolean
	boot: () => Promise<void>
	newGame: (o: NewGameOptions) => Promise<boolean>
	openFile: () => Promise<boolean>
	resume: () => Promise<boolean>
	importText: (text: string) => boolean
	exportFile: () => void
	chooseSaveFile: () => Promise<void>
	goMenu: () => Promise<void>
	setView: (v: View) => void
	selectCoin: (id: string) => void
	openNews: (id: string | null) => void
	setSpeed: (s: number) => void
	togglePause: () => void
	trade: (side: 'buy' | 'sell', coinId: string, units: number) => TradeResult
	mutate: (fn: (g: GameState) => void, urgent?: boolean) => void
	replaceGame: (g: GameState) => void
	toast: (t: Omit<Toast, 'id'>) => void
	dismissToast: (id: number) => void
	unlockAdmin: (pw: string) => 'ok' | 'unset' | 'bad'
	lockAdmin: () => void
	setAudio: (patch: Partial<AudioSettings>) => void
}

let toastId = 1
let handleKey = 'fileHandle'

function randomSeed(): string {
	const a = new Uint32Array(2)
	crypto.getRandomValues(a)
	return (
		'SD-' + a[0].toString(36).toUpperCase() + a[1].toString(36).toUpperCase()
	)
}
export { randomSeed }

export const useStore = create<Store>((set, get) => {
	const touch = (urgent = false): void => {
		set(s => ({ rev: s.rev + 1 }))
		saver.markDirty(urgent)
	}

	const adopt = async (
		g: GameState,
		handle: FileHandle | null
	): Promise<void> => {
		saver.getText = () => {
			const cur = get().game
			return cur ? serialize(cur) : null
		}
		saver.attach(handle)
		if (handle) {
			await idbSet(handleKey, handle)
			set({ resumeName: handle.name })
		}
		audio.apply(g.audio)
		set(s => ({
			game: g,
			rev: s.rev + 1,
			view: 'dashboard',
			coinId: g.coins[0]?.id ?? '',
			newsId: null,
			startError: null,
			adminOk: false
		}))
		if (handle) await saver.flush()
	}

	saver.subscribe(st => set({ save: st }))

	return {
		game: null,
		rev: 0,
		view: 'dashboard',
		coinId: '',
		newsId: null,
		toasts: [],
		save: saver.status,
		fsOk: fsSupported(),
		adminOk: false,
		booted: false,
		resumeName: null,
		startError: null,
		busy: false,

		boot: async () => {
			const prefs = await idbGet<{ audio?: AudioSettings }>('prefs')
			if (prefs?.audio) audio.apply(prefs.audio)
			const h = await idbGet<FileHandle>(handleKey)
			if (h && fsSupported()) {
				set({ resumeName: h.name })
				try {
					if (await ensurePermission(h, false)) {
						const g = deserialize(await readHandle(h))
						await adopt(g, h)
					}
				} catch (e) {
					set({
						startError:
							e instanceof Error ? e.message : 'Не удалось открыть сохранение.'
					})
				}
			}
			set({ booted: true })
		},

		newGame: async o => {
			set({ startError: null, busy: true })
			try {
				let handle: FileHandle | null = null
				if (o.useFile && fsSupported()) {
					try {
						handle = await pickNewFile('sdcoin.sdgame')
					} catch (e) {
						if (isAbort(e)) {
							set({ busy: false })
							return false
						}
						throw e
					}
					if (!(await ensurePermission(handle, true)))
						throw new Error('Нет разрешения на запись в выбранный файл.')
				}
				audio.unlock()
				const prefs = await idbGet<{ audio?: AudioSettings }>('prefs')
				const g = createGame({
					seed: o.seed,
					startingCash: o.startingCash,
					audio: prefs?.audio
				})
				await adopt(g, handle)
				if (!handle) await idbDel(handleKey)
				set({ busy: false })
				return true
			} catch (e) {
				set({
					busy: false,
					startError:
						e instanceof Error ? e.message : 'Не удалось создать игру.'
				})
				return false
			}
		},

		openFile: async () => {
			set({ startError: null, busy: true })
			try {
				const h = await pickOpenFile()
				await ensurePermission(h, true)
				const g = deserialize(await readHandle(h))
				audio.unlock()
				await adopt(g, h)
				set({ busy: false })
				return true
			} catch (e) {
				if (isAbort(e)) {
					set({ busy: false })
					return false
				}
				set({
					busy: false,
					startError:
						e instanceof Error ? e.message : 'Не удалось открыть файл.'
				})
				return false
			}
		},

		resume: async () => {
			set({ startError: null, busy: true })
			try {
				const h = await idbGet<FileHandle>(handleKey)
				if (!h)
					throw new Error('Связь с файлом потеряна. Выберите файл вручную.')
				if (!(await ensurePermission(h, true)))
					throw new Error('Доступ к файлу не разрешён.')
				const g = deserialize(await readHandle(h))
				audio.unlock()
				await adopt(g, h)
				set({ busy: false })
				return true
			} catch (e) {
				set({
					busy: false,
					startError:
						e instanceof Error ? e.message : 'Не удалось продолжить игру.'
				})
				return false
			}
		},

		importText: text => {
			try {
				const g = deserialize(text)
				audio.unlock()
				void adopt(g, null)
				return true
			} catch (e) {
				set({
					startError:
						e instanceof Error ? e.message : 'Не удалось импортировать файл.'
				})
				return false
			}
		},

		exportFile: () => {
			const g = get().game
			if (!g) return
			downloadText(
				`sdcoin-${g.seed.replace(/[^\w-]/g, '')}-d${Math.floor(g.tick / TPD) + 1}.sdgame`,
				serialize(g)
			)
		},

		chooseSaveFile: async () => {
			const g = get().game
			if (!g || !fsSupported()) return
			try {
				const h = await pickNewFile('sdcoin.sdgame')
				if (!(await ensurePermission(h, true)))
					throw new Error('Нет разрешения на запись в выбранный файл.')
				saver.attach(h)
				await idbSet(handleKey, h)
				set({ resumeName: h.name })
				saver.markDirty(true)
			} catch (e) {
				if (!isAbort(e))
					get().toast({
						kind: 'error',
						title: 'Не удалось выбрать файл',
						text: e instanceof Error ? e.message : undefined
					})
			}
		},

		goMenu: async () => {
			await saver.flush()
			saver.attach(null)
			set({ game: null, adminOk: false })
			const h = await idbGet<FileHandle>(handleKey)
			set({ resumeName: h ? h.name : null })
		},

		setView: v => {
			audio.unlock()
			audio.play('click')
			set({ view: v })
		},
		selectCoin: id => set({ coinId: id }),
		openNews: id => set({ newsId: id, view: 'news' }),

		setSpeed: s => {
			const g = get().game
			if (!g) return
			audio.play('toggle')
			g.speed = s
			touch(true)
		},

		togglePause: () => {
			const g = get().game
			if (!g) return
			audio.play('toggle')
			g.paused = !g.paused
			touch(true)
		},

		trade: (side, coinId, units) => {
			const g = get().game
			if (!g) return { ok: false, error: 'Игра не запущена.' }
			const res = executeTrade(g, side, coinId, units)
			if (res.ok) {
				audio.play(side === 'buy' ? 'buy' : 'sell')
				touch(true)
			} else {
				audio.play('error')
			}
			return res
		},

		mutate: (fn, urgent = true) => {
			const g = get().game
			if (!g) return
			fn(g)
			touch(urgent)
		},

		replaceGame: g => {
			set(s => ({
				game: g,
				rev: s.rev + 1,
				coinId: g.coins[0]?.id ?? '',
				newsId: null
			}))
			saver.markDirty(true)
		},

		toast: t => {
			const id = toastId++
			set(s => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }))
			window.setTimeout(() => get().dismissToast(id), 7000)
		},

		dismissToast: id =>
			set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

		unlockAdmin: pw => {
			if (!ADMIN_PASSWORD_MD5) return 'unset'
			const ok =
				SparkMD5.hash(pw).toLowerCase() ===
				ADMIN_PASSWORD_MD5.trim().toLowerCase()
			if (ok) {
				set({ adminOk: true })
				audio.play('toggle')
				return 'ok'
			}
			audio.play('error')
			return 'bad'
		},

		lockAdmin: () => set({ adminOk: false }),

		setAudio: patch => {
			const g = get().game
			const prev = g
				? g.audio
				: { master: 0.7, music: 0.35, sfx: 0.7, musicOn: true, sfxOn: true }
			const next = { ...prev, ...patch }
			audio.unlock()
			audio.apply(next)
			void idbSet('prefs', { audio: next })
			if (g) {
				g.audio = next
				touch(false)
			}
		}
	}
})

export function useGame(): GameState {
	useStore(s => s.rev)
	return useStore.getState().game as GameState
}

let loopStarted = false
export function startLoop(): void {
	if (loopStarted) return
	loopStarted = true
	let acc = 0
	let last = performance.now()
	window.setInterval(() => {
		const now = performance.now()
		const dt = now - last
		last = now
		const st = useStore.getState()
		const g = st.game
		if (!g || g.paused || document.hidden) {
			acc = 0
			return
		}
		acc += Math.min(dt, 250)
		const iv = (g.settings.secondsPerDay * 1000) / TPD / g.speed
		const before = g.news.length
		let n = 0
		while (acc >= iv && n < 4) {
			stepGame(g)
			acc -= iv
			n += 1
		}
		if (acc > iv) acc = iv
		if (n > 0) {
			useStore.setState(s => ({ rev: s.rev + 1 }))
			saver.markDirty(false)
			if (g.news.length > before) {
				const fresh = g.news.slice(before)
				const top = fresh.reduce(
					(a, b) => (b.importance > a.importance ? b : a),
					fresh[0]
				)
				if (top.importance >= 2) {
					st.toast({
						kind: 'news',
						title: top.headline,
						sentiment: top.sentiment
					})
					audio.play(top.importance === 3 ? 'alert' : 'news')
				}
			}
		}
	}, 100)
	window.addEventListener('pointerdown', () => audio.unlock(), { once: true })
	window.addEventListener('keydown', () => audio.unlock(), { once: true })
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) void saver.flush()
	})
	window.addEventListener('beforeunload', e => {
		const s = useStore.getState()
		if (s.game && s.save.state === 'none') {
			e.preventDefault()
		} else {
			void saver.flush()
		}
	})
}

export { admin }
