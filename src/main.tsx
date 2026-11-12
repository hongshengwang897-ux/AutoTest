import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const savedTheme = localStorage.getItem('autotest-theme')
document.documentElement.classList.toggle('dark', savedTheme === 'dark')
document.documentElement.style.colorScheme = savedTheme === 'dark' ? 'dark' : 'light'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
