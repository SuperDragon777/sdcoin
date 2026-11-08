import { useRef, useState } from 'react'
import { randomSeed, useStore } from '../store/store'
import { Field, Panel } from './common'
import { parseDecimal } from './format'

export function Start() {
	const s = useStore()
	const [seed, setSeed] = useState(() => randomSeed())
	const [cash, setCash] = useState('500000')
	const [useFile, setUseFile] = useState(true)
	const [err, setErr] = useState<string | null>(null)
	const fileRef = useRef<HTMLInputElement>(null)

	const create = async () => {
		setErr(null)
		const kop = parseDecimal(cash, 2)
		if (!seed.trim()) return setErr('Введите seed или сгенерируйте случайный.')
		if (kop === null || kop < 100000)
			return setErr(
				'Начальный капитал: не менее 1 000 ₽, не более двух знаков после запятой.'
			)
		await s.newGame({
			seed: seed.trim(),
			startingCash: kop,
			useFile: useFile && s.fsOk
		})
	}

	const onImport = async (f: File | undefined) => {
		if (!f) return
		s.importText(await f.text())
		if (fileRef.current) fileRef.current.value = ''
	}

	return (
		<div className="start">
			<div className="start-card stack">
				<div>
					<h1>
						SD<span style={{ color: 'var(--acc)' }}>coin</span>
					</h1>
					<p className="muted">
						Симулятор инвестиционного рынка.
					</p>
				</div>

				{s.startError && <div className="alert err">{s.startError}</div>}
				{!s.fsOk && (
					<div className="alert warn">
						Браузер не поддерживает запись в файл напрямую. Игра будет работать,
						а сохранять её нужно вручную кнопкой «Экспорт». Для автосохранения
						откройте SDcoin в Chrome или Edge.
					</div>
				)}

				{s.resumeName && s.fsOk && (
					<Panel title="Продолжить">
						<div className="row">
							<span className="grow">
								Файл: <b>{s.resumeName}</b>
							</span>
							<button
								className="btn primary"
								disabled={s.busy}
								onClick={() => void s.resume()}
							>
								Продолжить игру
							</button>
						</div>
					</Panel>
				)}

				<Panel title="Новая игра">
					<div className="stack">
						<Field
							label="Seed"
							hint="Одинаковый seed даёт одинаковые цены, новости и события."
						>
							<div className="row">
								<input
									className="input"
									value={seed}
									onChange={e => setSeed(e.target.value)}
									spellCheck={false}
								/>
								<button
									className="btn"
									onClick={() => setSeed(randomSeed())}
								>
									Случайный
								</button>
							</div>
						</Field>
						<Field label="Начальный капитал, ₽">
							<input
								className="input"
								value={cash}
								onChange={e => setCash(e.target.value)}
								inputMode="decimal"
							/>
						</Field>
						{s.fsOk && (
							<label className="row">
								<input
									type="checkbox"
									checked={useFile}
									onChange={e => setUseFile(e.target.checked)}
								/>
								<span>
									Сохранять в файл .sdgame (будет предложено выбрать место)
								</span>
							</label>
						)}
						{err && <div className="alert err">{err}</div>}
						<button
							className="btn primary"
							disabled={s.busy}
							onClick={() => void create()}
						>
							Начать игру
						</button>
					</div>
				</Panel>

				<Panel title="Загрузить сохранение">
					<div className="row wrap">
						{s.fsOk && (
							<button
								className="btn"
								disabled={s.busy}
								onClick={() => void s.openFile()}
							>
								Открыть файл .sdgame
							</button>
						)}
						<button
							className="btn"
							onClick={() => fileRef.current?.click()}
						>
							Импортировать файл
						</button>
						<input
							ref={fileRef}
							type="file"
							accept=".sdgame,application/json"
							hidden
							onChange={e => void onImport(e.target.files?.[0])}
						/>
					</div>
				</Panel>
				<p className="dim small">
					Звук и музыка включатся после первого нажатия
				</p>
			</div>
		</div>
	)
}
