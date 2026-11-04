import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works on GitHub Pages under /Home-Improvement/
// (the apps use hash routing, so no server rewrites are needed).
// Two pages: the Stockpile Tracker at the root and the Morning Board at /board/.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        board: 'board/index.html',
      },
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
