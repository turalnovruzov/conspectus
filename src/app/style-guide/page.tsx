import '../../design/style-guide.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Conspectus design system' }

// style-guide.html stays the single source the tests read; it is repo-owned markup.
function mainInnerHtml(): string {
  const html = readFileSync(join(process.cwd(), 'style-guide.html'), 'utf8')
  const match = html.match(/<main class="page">([\s\S]*)<\/main>/)
  if (!match) throw new Error('style-guide.html has no <main class="page">')
  return match[1]
}

export default function StyleGuidePage() {
  return <main className="page" dangerouslySetInnerHTML={{ __html: mainInnerHtml() }} />
}
