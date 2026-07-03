import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import App from './App'
import './styles.css'

// Без StrictMode: двойной mount эффектов ломает жизненный цикл xterm.js
createRoot(document.getElementById('root')!).render(<App />)
