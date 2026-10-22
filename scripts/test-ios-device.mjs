import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

await mkdir('.private', { recursive: true })
await build({ entryPoints: ['src/media.ts', 'src/deviceTools.ts'], bundle: true, outdir: '.private/ios-device-test', platform: 'node', format: 'esm', plugins: [{ name: 'isolated-device', setup(builder) {
  builder.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: 'capacitor', namespace: 'device-test' }))
  builder.onLoad({ filter: /.*/, namespace: 'device-test' }, () => ({ contents: 'export const Capacitor={isNativePlatform:()=>globalThis.iosTest.platform!=="web",getPlatform:()=>globalThis.iosTest.platform};export const registerPlugin=()=>globalThis.iosTest.native;' }))
  builder.onLoad({ filter: /[/\\]src[/\\]dataClient\.ts$/ }, () => ({ contents: 'export async function apiRequest(path,options){globalThis.iosTest.requests.push({path,body:JSON.parse(options.body)});return {url:"https://example.invalid/foto.jpg"}}' }))
} }] })

const state = { platform: 'ios', requests: [], prepared: 0, nativeCopies: [], browserCopies: [], photoError: false }
state.native = {
  async preparePhoto({ base64 }) { assert.ok(base64); state.prepared++; if (state.photoError) throw new Error('Foto inválida'); return { base64: Buffer.from('jpeg-preparado').toString('base64'), mimeType: 'image/jpeg' } },
  async copyText({ text }) { state.nativeCopies.push(text) },
}
const previousReader = globalThis.FileReader
const previousClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
globalThis.iosTest = state
globalThis.FileReader = class { readAsDataURL(file) { void file.arrayBuffer().then(bytes => { this.result = `data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`; this.onload() }) } }
Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText: async text => { state.browserCopies.push(text) } } })
try {
  const { uploadCatalogPhoto } = await import('../.private/ios-device-test/media.js')
  const { copyText } = await import('../.private/ios-device-test/deviceTools.js')
  const image = new globalThis.File(['foto-original'], 'foto.heic', { type: 'image/heic' })
  await uploadCatalogPhoto(image, 'professionals')
  assert.equal(state.prepared, 1); assert.equal(state.requests[0].body.mimeType, 'image/jpeg'); assert.equal(state.requests[0].body.base64, Buffer.from('jpeg-preparado').toString('base64'))
  await assert.rejects(uploadCatalogPhoto({ name: 'foto.heic', type: 'image/heic', size: 26 * 1024 * 1024 }, 'products'), /25 MB/)
  state.photoError = true
  await assert.rejects(uploadCatalogPhoto(image, 'products'), /Foto inválida/); assert.equal(state.requests.length, 1)
  state.photoError = false
  await copyText('https://example.invalid/agendar'); assert.equal(state.nativeCopies.length, 1); assert.equal(state.browserCopies.length, 0)
  for (const platform of ['android', 'web']) {
    state.platform = platform
    await assert.rejects(uploadCatalogPhoto(image, 'products'), /JPEG, PNG ou WebP/)
    await uploadCatalogPhoto(new globalThis.File(['jpeg-original'], 'foto.jpg', { type: 'image/jpeg' }), 'products')
    const last = state.requests.at(-1); assert.equal(last.body.base64, Buffer.from('jpeg-original').toString('base64')); assert.equal(last.body.mimeType, 'image/jpeg')
    await copyText('https://example.invalid/agendar')
  }
  assert.equal(state.browserCopies.length, 2); assert.equal(state.nativeCopies.length, 1)
  console.log('PASS recursos iPhone: HEIC segue para conversão nativa, limite de tamanho e falha de foto tratados, cópia nativa; navegador/Android preservam o fluxo anterior.')
} finally {
  globalThis.FileReader = previousReader
  if (previousClipboard) Object.defineProperty(globalThis.navigator, 'clipboard', previousClipboard)
  else delete globalThis.navigator.clipboard
  delete globalThis.iosTest
}
