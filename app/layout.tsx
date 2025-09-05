import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VoixLà',
  description: 'Application de transcription vocale avec Gemini AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.svg" sizes="any" />
      </head>
      <body className={"body"} suppressHydrationWarning>{children}</body>
    </html>
  )
}