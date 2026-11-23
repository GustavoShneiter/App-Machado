import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const result = await build({
  loader: { '.css': 'empty' },
  stdin: {
    contents: `
    import assert from 'node:assert/strict'
    import {createElement as h} from 'react'
    import {renderToString} from 'react-dom/server'
    import {MemoryRouter,Route,Routes} from 'react-router-dom'
    import {AdminLayout} from './src/App'
    import {AppointmentModal} from './src/ManagementPages'
    import {CatalogProvider} from './src/CatalogStore'
    import {TestContext} from './src/OperationsStore'
    import {emptyOperations,summarize,cashBalance,cashLedger,commandTotal,dayKey,csvCell,receivedOnDay,commissionsInPeriod} from './src/operations'
    import {fixture} from './scripts/operations-fixture.mjs'
    import {addDays,addMonths,agendaTimes,agendaTimesForDay,hoursForDay,recurringForDay} from './src/schedule'
    import {matchingCustomers} from './src/customerSearch'
    import {agendaLanes,resolveAgendaProfessionals} from './src/agendaLayout'
    import {AgendaSchedule} from './src/AgendaSchedule'
    const pages=['','agenda','caixa','comandas','clientes','produtos','servicos','profissionais','pacotes','empresa','relatorios','configuracoes','horarios']
    for(const data of [emptyOperations,fixture]){
      const value={data,loading:false,error:'',busy:false,refreshed:'12:00',refresh:async()=>{},clearError:()=>{},run:async()=>true}
      for(const page of pages){
        const path='/admin'+(page?'/'+page:'')
        const html=renderToString(h(MemoryRouter,{initialEntries:[path]},h(CatalogProvider,null,h(TestContext.Provider,{value},h(Routes,null,h(Route,{path:'/admin/*',element:h(AdminLayout)}))))))
        assert.ok(html.includes('class="page'),'Missing content '+path)
        if(data===fixture&&page==='clientes') assert.ok(html.includes('Cliente integrado'),'Missing real customer '+path)
        if(data===fixture&&page==='caixa') { assert.ok(html.includes('Recebido hoje'));assert.ok(html.includes('A receber de clientes'));assert.ok(html.includes('Dinheiro na gaveta'));assert.ok(html.includes('A repassar à equipe'));assert.ok(html.includes('Extrato')) }
        if(data===fixture&&page==='comandas') assert.ok(html.includes('Comandas'))
        console.log('PASS '+path+' '+(data===fixture?'with records':'empty'))
      }
      const modal=renderToString(h(MemoryRouter,null,h(CatalogProvider,null,h(TestContext.Provider,{value},h(AppointmentModal,{close(){}})))))
      assert.ok(modal.includes('Salvar agendamento'))
    }
    const summary=summarize(fixture,'2026-09-18','2026-09-18')
    assert.equal(summary.gross,8000);assert.equal(summary.earned,1600);assert.equal(summary.shop,6400)
    assert.equal(summary.received,4000);assert.equal(summary.pending,1600);assert.equal(summary.completed.length,2)
    assert.equal(summarize(fixture,'2026-09-18','2026-09-18','p2').earned,0)
    assert.equal(summarize(fixture,'2026-09-19','2026-09-19').gross,0)
    assert.equal(cashBalance(fixture,fixture.sessions[0]),9000,'Pix must not increase physical cash')
    assert.equal(commandTotal(fixture,fixture.commands[0]),4000)
    assert.equal(receivedOnDay(fixture,'2026-09-18'),4000)
    assert.equal(receivedOnDay(fixture,'2026-09-17'),7000)
    assert.equal(receivedOnDay(fixture,'2026-09-18','cash'),0)
    assert.equal(dayKey('2026-09-19T01:00:00Z'),'2026-09-18')
    const ledgerData=structuredClone(fixture)
    const movement=fixture.movements[0]
    ledgerData.movements=[
      {...movement,id:'october',session_id:'previous',created_at:'2026-11-01T02:59:59Z',amount_cents:600},
      {...movement,id:'november-start',session_id:'previous',created_at:'2026-11-01T03:00:00Z',amount_cents:10000},
      {...movement,id:'expense',session_id:'next',created_at:'2026-11-15T15:00:00Z',amount_cents:-1500,payment_method:'cash',command_id:null,notes:'Material'},
      {...movement,id:'november-end',session_id:'next',created_at:'2026-12-01T02:59:59Z',amount_cents:500,payment_method:'credit'},
      {...movement,id:'december',session_id:'next',created_at:'2026-12-01T03:00:00Z',amount_cents:700},
    ]
    const ledger=cashLedger(ledgerData,{month:'2026-11'})
    assert.equal(ledger.movements.length,3,'Month includes all cash sessions, using local transaction dates')
    assert.equal(ledger.incoming,10500);assert.equal(ledger.outgoing,1500);assert.equal(ledger.balance,9000,'Opening cash and unpaid commissions are not movements')
    assert.equal(cashLedger(ledgerData,{month:'2026-11',method:'cards'}).incoming,500)
    assert.equal(cashLedger(ledgerData,{month:'2026-11',direction:'out'}).balance,-1500)
    assert.equal(cashLedger(ledgerData,{month:'2026-11',professional:'p1'}).incoming,10500)
    assert.equal(cashLedger(ledgerData,{month:'2026-11',search:'material'}).outgoing,1500)
    assert.equal(cashLedger(ledgerData,{sessionId:'previous'}).incoming,10600,'Session view retains its full ledger')
    assert.equal(cashLedger(ledgerData,{month:'2027-01'}).balance,0)
    console.log('PASS Extrato mensal: vários caixas, limites do mês no fuso local, saldo, meios, profissional e busca')
    const payoutData=structuredClone(fixture)
    payoutData.commissions.push({...payoutData.commissions[0],id:'e2',status:'paid',paid_at:'2026-09-21T02:59:59Z'})
    payoutData.commissions.push({...payoutData.commissions[0],id:'e3',status:'paid',paid_at:'2026-09-21T03:00:00Z'})
    payoutData.commissions.push({...payoutData.commissions[0],id:'e4',professional_id:'p2'})
    assert.deepEqual(commissionsInPeriod(payoutData,{status:'pending',professional:'p1',from:'2026-09-18',to:'2026-09-18'}).map(item=>item.id),['e1'])
    assert.deepEqual(commissionsInPeriod(payoutData,{status:'pending',professional:'p1',from:'2026-09-19',to:'2026-09-25'}),[])
    assert.deepEqual(commissionsInPeriod(payoutData,{status:'paid',from:'2026-09-20',to:'2026-09-20'}).map(item=>item.id),['e2'])
    assert.deepEqual(commissionsInPeriod(payoutData,{status:'paid',from:'2026-09-21',to:'2026-09-21'}).map(item=>item.id),['e3'])
    console.log('PASS Repasses: período inclusivo, fuso da barbearia, profissional e data do pagamento')
    assert.equal(csvCell('=1+1').charCodeAt(1),39)
    assert.equal(csvCell('  =1+1').charCodeAt(1),39)
    const mixed=structuredClone(fixture)
    const first=mixed.commands[0]
    const extra={...mixed.items.find(item=>item.command_id===first.id),id:'extra-pro',professional_id:'p2',unit_price_cents:2000,commission_cents:0}
    mixed.items.push(extra)
    first.discount_cents=600
    assert.equal(summarize(mixed,'2026-09-18','2026-09-18','p1').earned,1600)
    assert.equal(summarize(mixed,'2026-09-18','2026-09-18','p1').gross,3600)
    assert.equal(summarize(mixed,'2026-09-18','2026-09-18','p2').gross,5800)
    const later=structuredClone(fixture)
    later.payments[0].paid_at='2026-09-19T15:00:00-03:00'
    assert.equal(summarize(later,'2026-09-19','2026-09-19','p1').received,4000)
    console.log('PASS financeiro: comissões, filtros, cancelados, dinheiro vs Pix, CSV')
    const directory=[{id:'one',name:'João da Silva',phone:'45999990001'},{id:'two',name:'João da Silva',phone:'45999990002'},{id:'three',name:'José Santos',phone:''}]
    assert.equal(matchingCustomers(directory,'joao silva').length,2,'Ignore accents and match name terms')
    assert.equal(matchingCustomers(directory,'99990002')[0].id,'two','Phone disambiguates duplicate names')
    assert.equal(matchingCustomers(directory,'jose')[0].id,'three','Existing customer may have no phone')
    assert.equal(matchingCustomers(directory,'inexistente').length,0)
    assert.equal(matchingCustomers(directory,'   ').length,0)
    console.log('PASS busca de clientes: acentos, termos, homônimos, telefone, ausência de telefone e busca vazia')
    assert.deepEqual(resolveAgendaProfessionals(['p2','p1','other-unit'],['p1','p2'],'p1'),['p1','p2'])
    assert.deepEqual(resolveAgendaProfessionals(['deleted'],['p1','p2'],'deleted'),['p1'])
    const parallel=[{...fixture.appointments[0],id:'parallel-one',starts_at:'2026-11-23T08:00:00-03:00',ends_at:'2026-11-23T08:40:00-03:00'},
      {...fixture.appointments[0],id:'parallel-two',professional_id:'p2',starts_at:'2026-11-23T08:00:00-03:00',ends_at:'2026-11-23T08:40:00-03:00'},
      {...fixture.appointments[0],id:'fit-in',starts_at:'2026-11-23T08:10:00-03:00',ends_at:'2026-11-23T08:25:00-03:00'}]
    const lanes=agendaLanes(parallel)
    assert.equal(lanes.get('parallel-one').columns,2);assert.equal(lanes.get('fit-in').columns,2)
    assert.equal(lanes.get('parallel-two').columns,1,'Different professionals must not share overlap lanes')
    const board=renderToString(h(AgendaSchedule,{date:'2098-03-10',columns:[{id:'p1',name:'Araújo'},{id:'p2',name:'Machado'},{id:'p3',name:'Gustavo'}],appointments:parallel.map(a=>({...a,starts_at:a.starts_at.replace('2026-11-23','2098-03-10'),ends_at:a.ends_at.replace('2026-11-23','2098-03-10')})),busyAppointments:parallel.map(a=>({...a,starts_at:a.starts_at.replace('2026-11-23','2098-03-10'),ends_at:a.ends_at.replace('2026-11-23','2098-03-10')})),blocks:[],split:true,chooseTime(){},chooseAppointment(){},chooseBlock(){}}))
    assert.ok(board.includes('Agenda de Araújo')&&board.includes('Agenda de Machado'),'A separate labeled column for every selected professional')
    assert.ok(board.includes('Ocupado às 08:00 · Araújo')&&board.includes('Ocupado às 08:00 · Machado'))
    assert.ok(board.includes('Abrir opções às 08:00 · Gustavo'),'A reservation for one professional must not block another')
    console.log('PASS Agenda conjunta: seleção válida, profissionais excluídos, colunas independentes e encaixes do mesmo profissional')
    assert.equal(addMonths('2026-01-31',1),'2026-02-28')
    assert.equal(addMonths('2028-02-29',12),'2029-02-28')
    assert.equal(addDays('2026-12-31',1),'2027-01-01')
    assert.deepEqual(agendaTimes.slice(0,3),['08:00','08:15','08:30']);assert.equal(agendaTimes.at(-1),'21:45')
    assert.deepEqual(agendaTimesForDay(undefined,'2026-11-22'),[],'Sunday is closed by default')
    assert.equal(hoursForDay(undefined,'2026-11-23')[0].closes_at,'22:00')
    assert.deepEqual(agendaTimesForDay([{weekday:1,opens_at:'09:00',closes_at:'10:00'}],'2026-11-23'),['09:00','09:15','09:30','09:45'])
    assert.deepEqual(agendaTimesForDay([{weekday:1,opens_at:'09:00',closes_at:'10:00'}],'2026-11-23',20),['09:00','09:20','09:40'])
    assert.deepEqual(agendaTimesForDay([{weekday:1,opens_at:'09:00',closes_at:'10:00'}],'2026-11-23',40),['09:00','09:40'])
    assert.deepEqual(agendaTimesForDay([],'2026-11-23'),[],'An entirely closed week must not use defaults')
    const rule={id:'rule',professional_id:'p1',starts_on:'2026-10-24',until_on:null,weekdays:[6],start_time:'00:00',end_time:'24:00',reason:'Sábado'}
    const blocks=recurringForDay([rule],'2026-10-24')
    assert.equal(blocks.length,1);assert.equal(blocks[0].ends_at,'2026-10-25T00:00:00-03:00')
    assert.equal(recurringForDay([{...rule,until_on:'2026-10-30'}],'2026-10-31').length,0)
    assert.equal(recurringForDay([rule],'2026-10-25').length,0)
    console.log('PASS Agenda: fim do mês, ano bissexto, intervalos configuráveis e recorrência com fuso da barbearia.')
  `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  write: false,
  jsx: "automatic",
  define: { "import.meta.env": "{}" },
  plugins: [
    {
      name: "test-context",
      setup(builder) {
        builder.onLoad(
          { filter: /OperationsStore[.]tsx$/ },
          async ({ path }) => ({
            contents:
              (await readFile(path, "utf8")) +
              "\nexport { Context as TestContext };",
            loader: "tsx",
          }),
        );
      },
    },
  ],
});
const testModule = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(
  createRequire(import.meta.url),
  testModule,
  testModule.exports,
);
