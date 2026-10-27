import '../styles.css'
import App from '../App'
import { getDb } from '../db/client'
import { loadSituations } from '../db/load-situations'

export const dynamic = 'force-dynamic'

export default async function Page() {
  return <App situations={await loadSituations(getDb().db)} />
}
