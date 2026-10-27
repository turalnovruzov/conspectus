import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

export function loadEnv(options: { file?: string; env?: NodeJS.Dict<string> } = {}): {
  file: string
  loaded: boolean
} {
  const env = options.env ?? process.env
  const file =
    options.file ?? env.CONSPECTUS_ENV_FILE ?? join(homedir(), '.config/conspectus/.env')
  if (!existsSync(file)) return { file, loaded: false }
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (env[key] === undefined) env[key] = value
  }
  return { file, loaded: true }
}

export function databaseUrl(env: NodeJS.Dict<string> = process.env): string {
  const url = env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set (expected in ~/.config/conspectus/.env)')
  return url
}
