const LOCAL_HOSTS = ['127.0.0.1', 'localhost']

// 5516 is another project's Postgres on the same server; the reader must never write there.
export function assertNotForeignDb(url: string): void {
  const parsed = new URL(url)
  if (parsed.port === '5516' || !LOCAL_HOSTS.includes(parsed.hostname)) {
    throw new Error(`Refusing database ${parsed.hostname}:${parsed.port}: not this project's local Postgres`)
  }
}
