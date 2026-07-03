import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import App from './App'
import './styles.css'

// Окно отдельной папки открывается с hash '#folder=<id>'
const folderParam = new URLSearchParams(location.hash.slice(1)).get('folder')

// Без StrictMode: двойной mount эффектов ломает жизненный цикл xterm.js
createRoot(document.getElementById('root')!).render(
  <App soloFolderId={folderParam ?? undefined} />
)
