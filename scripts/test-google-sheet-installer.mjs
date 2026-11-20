import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const source=await readFile('.private/google-installer/Code.gs','utf8')
const users=new Map();let user='A',books=new Map(),created=0
const properties=()=>({getProperty:key=>users.get(user)?.get(key)||null,setProperty:(key,value)=>{if(!users.has(user))users.set(user,new Map());users.get(user).set(key,value)}})
function column(value){return value.split('').reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)}
class Sheet{
 constructor(name){this.name=name;this.cells=new Map();this.cols=26}
 getMaxColumns(){return this.cols}insertColumnsAfter(_start,n){this.cols+=n}
 getRange(...args){let r,c,n=1,m=1;if(typeof args[0]==='string'){const [a,b]=args[0].split(':');const match=x=>x.match(/([A-Z]+)([0-9]+)/);const x=match(a);r=Number(x[2]);c=column(x[1]);if(b){const y=match(b);n=Number(y[2])-r+1;m=column(y[1])-c+1}}else[r,c,n=1,m=1]=args
  const range={};for(const method of ['merge','clear','setBackground','setFontColor','setFontSize','setFontWeight','setWrap','setNumberFormat'])range[method]=()=>range
  range.setValue=value=>{this.cells.set(r+':'+c,value);return range};range.setFormula=range.setValue
  range.setValues=rows=>{assert.equal(rows.length,n,'Row count');assert(rows.every(row=>row.length===m),'Column count');for(let i=0;i<n;i++)for(let j=0;j<m;j++)this.cells.set((r+i)+':'+(c+j),rows[i][j]);return range}
  return range
 }
 setName(name){this.name=name;return this}setFrozenRows(){}setFrozenColumns(){}setColumnWidth(){}setColumnWidths(){}setRowHeight(){}setTabColor(){}
}
class Book{
 constructor(id){this.id=id;this.sheets=[new Sheet('Página1')]}
 getId(){return this.id}getSheets(){return this.sheets}getSheetByName(name){return this.sheets.find(s=>s.name===name)}insertSheet(name){const sheet=new Sheet(name);this.sheets.push(sheet);return sheet}setSpreadsheetLocale(){}setSpreadsheetTimeZone(){}
}
const context=vm.createContext({PropertiesService:{getUserProperties:properties},SpreadsheetApp:{create:()=>{created++;const book=new Book('book-'+created);books.set(book.id,book);return book},openById:id=>books.get(id),flush:()=>{}},LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>({timeBased(){return this},everyMinutes(){return this},create(){}}),getOAuthToken:()=>user+'-google-token'},console,Date,JSON,Map,Set,Math,Number,String,Array,Error})
vm.runInContext(source,context)
const bookA=new Book('A-book')
context.bookA=bookA;vm.runInContext('prepararPlanilhaNova(bookA,2028,"Machado A",[{key:"service:cut",name:"Corte",price:4000,active:true},{key:"service:barber",name:"Barba",price:3000,active:true}])',context)
assert.equal(bookA.sheets.length,13)
assert.equal(bookA.getSheetByName('FEVEREIRO').cells.get('32:4'),29,'Leap-year calendar')
assert.match(bookA.getSheetByName('JANEIRO').cells.get('4:22'),/E4\*\$B\$2/)
assert.equal(bookA.getSheetByName('RESUMO').cells.get('4:3'),"='JANEIRO'!Z38",'Summary commission reference matches connector target')
assert.equal(bookA.getSheetByName('JANEIRO').cells.get('38:26'),0)
assert.equal(bookA.getSheetByName('JANEIRO').cells.get('2:2'),40)
assert.equal(vm.runInContext('literalPlanilha("=IMPORTXML(bad)")',context),"'=IMPORTXML(bad)")
// The same shared deployment must never reuse another Google user's credentials.
properties().setProperty('private-token','A-only');user='B';assert.equal(properties().getProperty('private-token'),null)
const jobs={A:[{year:2027}],B:[{year:2027}]},completions=[]
for(const label of ['A','B']){user=label;properties().setProperty('machado-installations',JSON.stringify({[label]:{unit_id:label,token:label+'-installation',business_name:'Machado '+label}}))}
context.automaticRequest=(route,installation,body)=>{const label=installation.unit_id;assert.equal(user,label);if(route==='jobs')return {unit_id:label,business_name:'Machado '+label,catalog:[],jobs:jobs[label],linked:completions.filter(item=>item.unit===label).map(item=>({year:2027,spreadsheetId:item.document,token:label+'-feed'}))};if(route==='complete'){jobs[label]=[];completions.push({unit:label,document:body.spreadsheet_id});return {spreadsheetId:body.spreadsheet_id,token:label+'-feed'}}throw Error('Unexpected route')}
context.sincronizarPlanilha=connection=>assert.equal(connection.unitId,user)
for(const label of ['A','B']){user=label;vm.runInContext('sincronizarUnidadesMachado()',context)}
assert.equal(created,2);assert.notEqual(completions[0].document,completions[1].document)
user='A';properties().setProperty('machado-connections','[]')
for(const label of ['A','B']){user=label;vm.runInContext('sincronizarUnidadesMachado()',context)}
user='A';assert.equal(JSON.parse(properties().getProperty('machado-connections'))[0].token,'A-feed','Reconnect restores the same private connection')
assert.equal(created,2,'Repeat login/tick does not create duplicate files')
console.log('PASS: new annual template, leap-year dates, price/total and repasse formulas, formula text protection, private Google user properties and two separate idempotent workbook creations.')
