import '../styles.css'
import sample from '../data/sample-situations.json'
import App from '../App'
import { parseSituations } from '../situations'

export default function Page() {
  return <App situations={parseSituations(sample)} />
}
