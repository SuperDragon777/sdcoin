export interface WritableLike {
	write(data: string): Promise<void>
	close(): Promise<void>
}

export interface FileHandle {
	name: string
	getFile(): Promise<File>
	createWritable(): Promise<WritableLike>
	queryPermission?(o: { mode: 'readwrite' | 'read' }): Promise<string>
	requestPermission?(o: { mode: 'readwrite' | 'read' }): Promise<string>
}

const TYPES = [
	{
		description: 'Сохранение SDcoin',
		accept: { 'application/json': ['.sdgame'] }
	}
]

export const fsSupported = (): boolean =>
	typeof window !== 'undefined' &&
	'showSaveFilePicker' in window &&
	'showOpenFilePicker' in window

export async function pickNewFile(suggested: string): Promise<FileHandle> {
	const w = window as any
	return (await w.showSaveFilePicker({
		suggestedName: suggested,
		types: TYPES
	})) as FileHandle
}

export async function pickOpenFile(): Promise<FileHandle> {
	const w = window as any
	const [h] = await w.showOpenFilePicker({ types: TYPES, multiple: false })
	return h as FileHandle
}

export async function ensurePermission(
	h: FileHandle,
	request: boolean
): Promise<boolean> {
	if (!h.queryPermission) return true
	const q = await h.queryPermission({ mode: 'readwrite' })
	if (q === 'granted') return true
	if (!request || !h.requestPermission) return false
	return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
}

export async function readHandle(h: FileHandle): Promise<string> {
	const f = await h.getFile()
	return await f.text()
}

export function isAbort(e: unknown): boolean {
	return (
		!!e &&
		typeof e === 'object' &&
		(e as { name?: string }).name === 'AbortError'
	)
}

export type SaveState = 'none' | 'idle' | 'saving' | 'saved' | 'error'

export interface SaveStatus {
	state: SaveState
	message: string
	at: number | null
	name: string | null
}

type Listener = (s: SaveStatus) => void

class Saver {
	handle: FileHandle | null = null
	getText: (() => string | null) | null = null
	status: SaveStatus = {
		state: 'none',
		message: 'Файл не выбран',
		at: null,
		name: null
	}
	private timer: number | null = null
	private dirty = false
	private writing = false
	private pending = false
	private listeners = new Set<Listener>()

	subscribe(fn: Listener): () => void {
		this.listeners.add(fn)
		return () => {
			this.listeners.delete(fn)
		}
	}

	private set(s: Partial<SaveStatus>): void {
		this.status = { ...this.status, ...s }
		for (const l of this.listeners) l(this.status)
	}

	attach(h: FileHandle | null): void {
		this.handle = h
		this.dirty = false
		this.pending = false
		if (this.timer !== null) {
			window.clearTimeout(this.timer)
			this.timer = null
		}
		if (h) this.set({ state: 'idle', message: 'Файл подключён', name: h.name })
		else
			this.set({
				state: 'none',
				message: 'Файл не выбран',
				name: null,
				at: null
			})
	}

	markDirty(urgent: boolean): void {
		if (!this.handle) return
		this.dirty = true
		if (urgent) {
			if (this.timer !== null) window.clearTimeout(this.timer)
			this.timer = window.setTimeout(() => this.fire(), 700)
		} else if (this.timer === null) {
			this.timer = window.setTimeout(() => this.fire(), 6000)
		}
	}

	private fire(): void {
		this.timer = null
		void this.run()
	}

	async flush(): Promise<void> {
		if (this.timer !== null) {
			window.clearTimeout(this.timer)
			this.timer = null
		}
		if (this.handle && (this.dirty || this.status.state === 'idle'))
			await this.run(true)
	}

	private async run(force = false): Promise<void> {
		if (!this.handle || !this.getText) return
		if (this.writing) {
			this.pending = true
			return
		}
		if (!this.dirty && !force) return
		this.writing = true
		try {
			do {
				this.pending = false
				this.dirty = false
				const h = this.handle
				const text = this.getText()
				if (!h || text === null) break
				this.set({ state: 'saving', message: 'Сохранение…' })
				try {
					const w = await h.createWritable()
					await w.write(text)
					await w.close()
					this.set({ state: 'saved', message: 'Сохранено', at: Date.now() })
				} catch (e) {
					this.dirty = true
					const msg = e instanceof Error ? e.message : 'неизвестная ошибка'
					this.set({ state: 'error', message: `Ошибка записи: ${msg}` })
					this.timer = window.setTimeout(() => this.fire(), 10000)
					break
				}
			} while (this.pending)
		} finally {
			this.writing = false
		}
	}
}

export const saver = new Saver()

export function downloadText(name: string, text: string): void {
	const blob = new Blob([text], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = name
	document.body.appendChild(a)
	a.click()
	a.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
