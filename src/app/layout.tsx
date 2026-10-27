import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '../design/fonts.css'
import '../design/tokens.css'
import '../design/components.css'

export const metadata: Metadata = { title: 'Conspectus' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
