import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium, webkit, devices} from '@playwright/test'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5195'
const entries = [
  ['/app/admin', '/app.webmanifest', '/app/admin', 'Machado Gestão'],
  ['/app/instalar', '/app.webmanifest', '/app/admin', 'Machado Gestão'],
  ['/admin/caixa', '/admin.webmanifest', '/admin', 'Machado Gestão'],
  ['/profissional/inicio', '/professional.webmanifest', '/profissional/inicio', 'Machado Pro'],
  ['/agendar', '/manifest.webmanifest', '/agendar', 'Barbearia Machado'],
]
await mkdir('.private/screenshots/home-screen', {recursive:true})
for (const [engine, label] of [[chromium, 'chrome'], [webkit, 'safari']]) {
  const browser = await engine.launch({headless:true})
  try {
    // No application JavaScript runs here: installation metadata must already
    // be correct in the HTTP response, before a browser can cache the manifest.
    const raw = await browser.newContext({javaScriptEnabled:false})
    const initial = await raw.newPage()
    for (const [path, manifestPath, startUrl, title] of entries) {
      await initial.goto(base + path)
      assert.equal(await initial.locator('link[rel="manifest"]').getAttribute('href'), manifestPath, path)
      assert.equal(await initial.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'), title, path)
      const response = await raw.request.get(base + manifestPath)
      const manifest = await response.json()
      assert.equal(manifest.start_url, startUrl)
      assert.ok(startUrl.startsWith(manifest.scope))
      assert.equal(manifest.display, 'standalone')
      assert.equal(await initial.locator('link[rel="manifest"]').count(), 1)
    }
    await raw.close()
    const context = await browser.newContext({...devices['iPhone 13'], locale:'pt-BR'})
    const page = await context.newPage(), errors = []
    page.on('pageerror', error=>errors.push(error.message))
    await page.route('**/api/**', route=> {
      const path = new URL(route.request().url()).pathname
      if(path.endsWith('/get-session'))return route.fulfill({json:{user:null,session:null}})
      if(path.endsWith('/catalog'))return route.fulfill({json:{data:{business:{name:'Barbearia Machado',phone:null},services:[],professionals:[],links:[]}}})
      return route.fulfill({json:{data:null,error:null}})
    })
    for(const [manifestPath, destination, heading] of [
      ['/app.webmanifest','/app/admin','Machado Gestão'],
      ['/admin.webmanifest','/admin','Entrar no painel'],
      ['/professional.webmanifest','/profissional/inicio','Entre na sua conta'],
      ['/manifest.webmanifest','/agendar','Como podemos te atender?'],
    ]) {
      const manifest=await (await context.request.get(base+manifestPath)).json()
      await page.goto(base+manifest.start_url)
      await page.getByRole('heading',{name:heading,exact:true}).waitFor()
      assert.equal(new URL(page.url()).pathname,destination)
      assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),manifestPath)
      if(destination==='/app/admin')await page.screenshot({path:`.private/screenshots/home-screen/gestao-${label}.png`,animations:'disabled'})
    }
    assert.deepEqual(errors,[])
    console.log(`PASS ${label}: initial HTML without JavaScript and Home Screen launch URLs keep Gestão, Profissional and booking separate.`)
    await context.close()
  } finally {await browser.close()}
}
