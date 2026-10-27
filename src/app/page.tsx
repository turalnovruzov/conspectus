import '../styles.css'
import App from '../App'
import { getDb } from '../db/client'
import { loadLiveView } from '../db/live-view'
import { loadPageModel } from '../situations'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const model = await loadPageModel(() => loadLiveView(getDb().db))
  return <App model={model} />
}
