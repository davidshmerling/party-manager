import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { SupabaseConfigMissing } from './components/SupabaseConfigMissing.tsx'
import { getSupabase } from './lib/supabase.ts'
import './index.css'
import './tailwind.css'
import './mobile-guest.css'
import App from './App.tsx'

const supabaseClient = getSupabase()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseClient ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider supabase={supabaseClient}>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <SupabaseConfigMissing />
    )}
  </StrictMode>,
)
