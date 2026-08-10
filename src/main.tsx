import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Native app (Capacitor shell): boot straight into the terminal flow instead of
// the public landing page. RequireAuth bounces to /login when there's no session,
// so a fresh install lands on the login page; returning users go to the terminal.
if (
  typeof window !== 'undefined' &&
  (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.()
) {
  window.history.replaceState(null, '', '/terminal')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
