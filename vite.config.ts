import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
	base: '/sdcoin/',
	plugins: [react()],
	server: { port: 5173, open: false },
	build: { chunkSizeWarningLimit: 900 }
})
