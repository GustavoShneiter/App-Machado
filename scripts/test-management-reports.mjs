import { build } from 'esbuild'
import { createRequire } from 'node:module'

const result = await build({
  stdin: { contents: `
import assert from 'node:assert/strict'
import {emptyOperations} from './src/operations'
import {buildManagementReport,allocateCents,validReportRange} from './src/reports/metrics'
import {fixture} from './scripts/operations-fixture.mjs'
const people=[{id:'p1',nome:'Araújo'},{id:'p2',nome:'Machado'}]
const sum=values=>[...values.values()].reduce((total,value)=>total+value,0)
assert.equal(sum(allocateCents(1,[{id:'p1',weight:1},{id:'p2',weight:1},{id:'p3',weight:1}])),1)
assert.deepEqual([...allocateCents(1,[{id:'p3',weight:1},{id:'p1',weight:1},{id:'p2',weight:1}])],[['p1',1],['p2',0],['p3',0]])
assert.equal(sum(allocateCents(4999,[{id:'p1',weight:2000},{id:'p2',weight:3000}])),4999)
assert.equal(sum(allocateCents(-7,[{id:'p1',weight:1},{id:'p2',weight:1}])), -7)
assert.deepEqual([...allocateCents(25,[])],[['__counter__',25]])
assert.equal(validReportRange('2028-02-29','2028-03-01'),true)
assert.equal(validReportRange('2027-02-29','2027-03-01'),false)
assert.equal(validReportRange('2026-10-01','2026-09-01'),false)
assert.equal(validReportRange('2025-01-01','2026-12-31'),false)
const report=buildManagementReport(fixture,people,'2026-09-18','2026-09-18')
assert.equal(report.gross,8000);assert.equal(report.received,4000);assert.equal(report.earned,1600)
assert.equal(report.pending,1600);assert.equal(report.expenses,1000);assert.equal(report.result,5400)
assert.equal(report.services,2);assert.equal(report.customers,2);assert.equal(report.completed,2)
assert.equal(report.parts.reduce((s,row)=>s+row.amount,0),report.gross)
assert.equal(report.timeline.reduce((s,row)=>s+row.amount,0),report.gross)
const selected=buildManagementReport(fixture,people,'2026-09-18','2026-09-18','p1')
assert.equal(selected.people.length,1);assert.equal(selected.people[0].id,'p1');assert.equal(selected.gross,4000)
assert.equal(selected.expenses,0);assert.equal(selected.result,2400,'Overhead has no arbitrary professional attribution')
assert.ok(selected.appointments.every(a=>a.professional_id==='p1'))
const history=structuredClone(fixture)
history.packageSales[0].sold_at='2026-09-18T12:00:00Z'
history.commands.push({id:'redeemed',appointment_id:null,customer_id:'c1',status:'closed',discount_cents:4000,surcharge_cents:0,created_at:'2026-09-18T12:00:00Z',closed_at:'2026-09-18T12:00:00Z'})
history.items.push({...history.items[0],id:'redemption-item',command_id:'redeemed',commission_cents:0})
const withPackage=buildManagementReport(history,people,'2026-09-18','2026-09-18')
assert.equal(withPackage.gross,15000,'Package counted only at sale, not again at redemption')
assert.equal(withPackage.received,11000)
assert.equal(buildManagementReport(history,people,'2026-09-18','2026-09-18','p1').gross,4000,'Package has no invented barber ownership')
history.packageSales[0].status='cancelled';assert.equal(buildManagementReport(history,people,'2026-09-18','2026-09-18').gross,8000)
const reversed=structuredClone(fixture);reversed.payments[0].reversed_at='2026-09-18T20:00:00Z';reversed.commissions[0].status='voided'
const voided=buildManagementReport(reversed,people,'2026-09-18','2026-09-18');assert.equal(voided.received,0);assert.equal(voided.earned,0);assert.equal(voided.pending,0)
const receivedLater=structuredClone(fixture);receivedLater.payments[0].paid_at='2026-09-19T15:00:00Z'
const paymentDay=buildManagementReport(receivedLater,people,'2026-09-19','2026-09-19','p1');assert.equal(paymentDay.gross,0);assert.equal(paymentDay.received,4000)
const legacy=structuredClone(fixture);legacy.appointments[0].status='cancelled'
const legacyReport=buildManagementReport(legacy,people,'2026-09-18','2026-09-18','p1');assert.equal(legacyReport.received,4000);assert.equal(legacyReport.gross,4000);assert.equal(legacyReport.earned,1600);assert.equal(legacyReport.completed,0,'Agenda cancellation cannot erase a valid financial posting')
for(const status of ['voided','refunded']){const cancelled=structuredClone(fixture);cancelled.commands[0].status=status;const cancelledReport=buildManagementReport(cancelled,people,'2026-09-18','2026-09-18','p1');assert.equal(cancelledReport.gross,0);assert.equal(cancelledReport.received,0);assert.equal(cancelledReport.earned,0)}
const partials=structuredClone(fixture);partials.payments[0].amount_cents=1000;partials.payments.push({...partials.payments[0],id:'partial-next-day',amount_cents:3000,paid_at:'2026-09-19T15:00:00Z'})
assert.equal(buildManagementReport(partials,people,'2026-09-18','2026-09-18','p1').received,1000);assert.equal(buildManagementReport(partials,people,'2026-09-19','2026-09-19','p1').received,3000)
const mixed=structuredClone(fixture);mixed.items.push({...mixed.items[0],id:'mixed-p2',professional_id:'p2',commission_cents:500,unit_price_cents:2000});mixed.commands[0].discount_cents=1;mixed.payments[0].amount_cents=5999
const mixedAll=buildManagementReport(mixed,people,'2026-09-18','2026-09-18')
const a=buildManagementReport(mixed,people,'2026-09-18','2026-09-18','p1'),b=buildManagementReport(mixed,people,'2026-09-18','2026-09-18','p2')
assert.equal(a.gross+b.gross,mixedAll.gross);assert.equal(a.received+b.received,mixedAll.received)
assert.equal(mixedAll.parts.reduce((s,row)=>s+row.amount,0),mixedAll.gross)
const lateNight=structuredClone(fixture);lateNight.commands[0].appointment_id=null;lateNight.commands[0].closed_at='2026-09-19T01:00:00Z'
assert.equal(buildManagementReport(lateNight,people,'2026-09-18','2026-09-18','p1').gross,4000,'Date is the barbershop timezone, not UTC day')
const empty=buildManagementReport(emptyOperations,people,'2026-09-18','2026-09-18');assert.equal(empty.gross,0);assert.equal(empty.people.length,2);assert.equal(empty.parts.length,0);assert.equal(empty.timeline[0].amount,0)
console.log('PASS relatórios: parcelas fecham no centavo; filtros, pagamentos/estornos, despesas gerais, comissão por situação, pacotes sem duplicação e fuso da barbearia.')
`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, define: { 'import.meta.env': '{}' },
})
new Function('require', result.outputFiles[0].text)(createRequire(import.meta.url))
