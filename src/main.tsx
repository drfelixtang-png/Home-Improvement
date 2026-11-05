import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './theme-board.css'
import App from './App.tsx'
import { captureFromBoard } from './lib/fromBoard'

captureFromBoard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
