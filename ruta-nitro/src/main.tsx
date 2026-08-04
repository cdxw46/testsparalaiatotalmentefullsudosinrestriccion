import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/racing-sans-one'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
