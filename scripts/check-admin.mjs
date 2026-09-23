/* global process */
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const result = await build({
  stdin: { contents: `
    import assert from 'node:assert/strict'
    import {createElement as h} from 'react'
    import {renderToString} from 'react-dom/server'
    import {MemoryRouter,Route,Routes} from 'react-router-dom'
    import {AdminLayout} from './src/App'
    import {AppointmentModal} from './src/ManagementPages'
    import {CatalogProvider} from './src/CatalogStore'
    import {TestContext} from './src/OperationsStore'
    import {emptyOperations,summarize,cashBalance,commandTotal,dayKey,csvCell} from './src/operations'
    import {fixture} from './scripts/operations-fixture.mjs'
    const pages=['','agenda','caixa','comandas','clientes','produtos','servicos','profissionais','pacotes','empresa','relatorios','configuracoes']
    for(const data of [emptyOperations,fixture]){
      const value={data,loading:false,error:'',busy:false,refreshed:'12:00',refresh:async()=>{},run:async()=>true}
      for(const page of pages){
        const path='/admin'+(page?'/'+page:'')
        const html=renderToString(h(MemoryRouter,{initialEntries:[path]},h(CatalogProvider,null,h(TestContext.Provider,{value},h(Routes,null,h(Route,{path:'/admin/*',element:h(AdminLayout)}))))))
        assert.ok(html.includes('class="page'),'Missing content '+path)
        if(data===fixture&&['clientes','caixa'].includes(page)) assert.ok(html.includes('Cliente integrado'),'Missing real customer '+path)
        if(data===fixture&&page==='caixa') { assert.ok(html.includes('Prontas para receber'));assert.ok(html.includes('Corte integrado')) }
        if(data===fixture&&page==='comandas') assert.ok(html.includes('Comandas'))
        console.log('PASS '+path+' '+(data===fixture?'with records':'empty'))
      }
      const modal=renderToString(h(CatalogProvider,null,h(TestContext.Provider,{value},h(AppointmentModal,{close(){}}))))
      assert.ok(modal.includes('Salvar agendamento'))
    }
    const summary=summarize(fixture,'2026-09-18','2026-09-18')
    assert.equal(summary.gross,8000);assert.equal(summary.earned,1600);assert.equal(summary.shop,6400)
    assert.equal(summary.received,4000);assert.equal(summary.pending,1600);assert.equal(summary.completed.length,2)
    assert.equal(summarize(fixture,'2026-09-18','2026-09-18','p2').earned,0)
    assert.equal(summarize(fixture,'2026-09-19','2026-09-19').gross,0)
    assert.equal(cashBalance(fixture,fixture.sessions[0]),9000,'Pix must not increase physical cash')
    assert.equal(commandTotal(fixture,fixture.commands[0]),4000)
    assert.equal(dayKey('2026-09-19T01:00:00Z'),'2026-09-18')
    assert.equal(csvCell('=1+1').charCodeAt(1),39)
    console.log('PASS financeiro: comissões, filtros, cancelados, dinheiro vs Pix, CSV')
  `, resolveDir:process.cwd(),loader:'tsx'},
  bundle:true,platform:'node',format:'cjs',packages:'external',write:false,jsx:'automatic',
  define:{'import.meta.env':'{}'},
  plugins:[{name:'test-context',setup(builder){builder.onLoad({filter:/OperationsStore[.]tsx$/},async({path})=>({contents:await readFile(path,'utf8')+'\nexport { Context as TestContext };',loader:'tsx'}))}}],
})
const testModule={exports:{}}
new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),testModule,testModule.exports)
