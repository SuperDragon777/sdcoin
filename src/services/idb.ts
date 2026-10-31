const DB_NAME = 'sdcoin'
const STORE = 'kv'

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1)
		req.onupgradeneeded = () => {
			req.result.createObjectStore(STORE)
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
	try {
		const db = await open()
		return await new Promise<T | undefined>((resolve, reject) => {
			const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
			req.onsuccess = () => resolve(req.result as T | undefined)
			req.onerror = () => reject(req.error)
		})
	} catch {
		return undefined
	}
}

export async function idbSet(key: string, value: unknown): Promise<void> {
	try {
		const db = await open()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite')
			tx.objectStore(STORE).put(value, key)
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	} catch {
		return
	}
}

export async function idbDel(key: string): Promise<void> {
	try {
		const db = await open()
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite')
			tx.objectStore(STORE).delete(key)
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	} catch {
		return
	}
}
