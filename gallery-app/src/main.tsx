import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { LikhAIProvider } from './contexts/LikhAIContext'
import { Toaster } from 'sonner'
import { supabase } from './lib/supabase'
import { initSentry } from './lib/sentry'

initSentry(supabase)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <LikhAIProvider>
          <App />
          <Toaster position="bottom-right" richColors closeButton />
        </LikhAIProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
