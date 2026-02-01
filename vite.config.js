import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Ganti 'Generated-image' sesuai dengan nama repositori GitHub Anda
export default defineConfig({
  plugins: [react()],
  base: '/Generated-image/', 
})
