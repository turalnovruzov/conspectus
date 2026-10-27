import { mkdirSync, writeFileSync } from 'node:fs'
import OpenAI from 'openai'
import { loadEnv } from '../src/env.ts'

// Live probe of OpenRouter's response shapes (costs about $0.0001). Writes raw JSON, label dropped, to the run dir.
loadEnv()
const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')
const [chatModel = 'openai/gpt-4.1-nano', embeddingModel = 'qwen/qwen3-embedding-8b', outDir = '.codery/run/7-reader/probe'] =
  process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const base = 'https://openrouter.ai/api/v1'
const headers = { Authorization: `Bearer ${apiKey}` }
const save = (name: string, value: unknown) =>
  writeFileSync(`${outDir}/${name}.json`, JSON.stringify(value, null, 2).replaceAll(apiKey, '[redacted]'))

async function key(name: string) {
  const res = await fetch(`${base}/key`, { headers })
  const body = (await res.json()) as { data?: Record<string, unknown> }
  if (body.data) delete body.data.label
  save(name, { status: res.status, body })
  return body
}

await key('key-before')
const models = await (await fetch(`${base}/models`)).json()
save('models', models)
const embeddingModels = await (await fetch(`${base}/embeddings/models`)).json().catch(() => null)
save('embedding-models', embeddingModels)

const client = new OpenAI({ baseURL: base, apiKey })
const chat = await client.chat.completions.create({
  model: chatModel,
  messages: [{ role: 'user', content: 'Reply with the JSON {"ok": true} and nothing else.' }],
  max_tokens: 20,
  temperature: 0,
  // @ts-expect-error OpenRouter extension: usage accounting in the response
  usage: { include: true },
})
save('chat', chat)
const embedding = await client.embeddings.create({ model: embeddingModel, input: ['floods in the delta', 'talks resume'] })
save('embedding', { ...embedding, data: embedding.data.map((d) => ({ ...d, embedding: `[${d.embedding.length} numbers]` })) })
await new Promise((r) => setTimeout(r, 3000))
await key('key-after')
console.log(`probe written to ${outDir}`)
