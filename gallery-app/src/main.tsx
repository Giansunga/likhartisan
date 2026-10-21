import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { LikhAIProvider } from './contexts/LikhAIContext'
import PopupHost from './components/Popup'
import { supabase } from './lib/supabase'
import { initSentry } from './lib/sentry'

initSentry(supabase)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <LikhAIProvider>
          <App />
          <PopupHost />
        </LikhAIProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
