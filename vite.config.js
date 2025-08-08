import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// !! DŮLEŽITÉ: Změňte 'base' na název svého repozitáře na GitHubu.
// Příklad: pokud repo = max-open-microsite, nastavte base: '/max-open-microsite/'
export default defineConfig({
  plugins: [react()],
  base: '/max-open-microsite/'
})
