'use client'

import dynamic from 'next/dynamic'

// Importer le composant en client-only (pas de SSR)
const VoiceRecorder = dynamic(() => import('./components/VoiceRecorder'), {
  ssr: false,
  loading: () => <div style={{
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: '1.2rem'
  }}>🎙️ Chargement...</div>
})

export default function Home() {
  return <VoiceRecorder />
}