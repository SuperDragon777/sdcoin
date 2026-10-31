import { useEffect } from 'react'
import { startLoop, useStore } from '../store/store'
import { Start } from './Start'
import { Layout } from './Layout'

export function App() {
	const game = useStore(s => s.game)
	const booted = useStore(s => s.booted)
	const boot = useStore(s => s.boot)
	useEffect(() => {
		startLoop()
		void boot()
	}, [boot])
	if (!booted)
		return (
			<div className="start">
				<span className="muted">Загрузка…</span>
			</div>
		)
	return game ? <Layout /> : <Start />
}
