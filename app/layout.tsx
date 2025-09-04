import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Transcripteur Vocal',
  description: 'Application de transcription vocale avec Gemini AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}