import { parseHTML } from 'linkedom'

export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return collapse(html)
  const { document } = parseHTML(`<!doctype html><html><body><div id="x">${html}</div></body></html>`)
  return collapse(document.getElementById('x')?.textContent ?? '')
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
