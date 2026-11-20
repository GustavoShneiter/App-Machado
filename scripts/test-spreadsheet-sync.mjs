import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFile} from 'node:fs/promises'
import {subtractBaseline,sheetId} from '../server/spreadsheets.mjs'

assert.equal(sheetId('https://docs.google.com/spreadsheets/d/123456789012345678901234/edit'),'123456789012345678901234')
assert.throws(()=>sheetId('https://example.com/spreadsheet'))
const original=[{date:'2026-11-19',key:'service:cut',quantity:4,amount:16000}]
assert.deepEqual(subtractBaseline(original,original),[])
assert.equal(subtractBaseline([{...original[0],quantity:5,amount:20500}],original)[0].amount,4500)
assert.equal(subtractBaseline([],original)[0].quantity,-4)

// In-memory Sheets adapter. Tests the actual connector code without real accounts.
let nextId=1
class Sheet {
 constructor(name){this.name=name;this.id=nextId++;this.rows=1000;this.columns=29;this.cells=new Map()}
 getName(){return this.name} getSheetId(){return this.id}
 getMaxRows(){return this.rows} getMaxColumns(){return this.columns}
 insertRowsAfter(_,count){this.rows+=count} insertColumnsAfter(_,count){this.columns+=count}
 hideSheet(){} setColumnWidth(){}
 getLastRow(){return Math.max(1,...[...this.cells.keys()].map(key=>Number(key.split(',')[0])))}
 getLastColumn(){return Math.max(1,...[...this.cells.keys()].map(key=>Number(key.split(',')[1])))}
 getRange(row,col,height=1,width=1){
  if(typeof row==='string'){const match=row.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);if(match[3]){width=[...match[3]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)+1;height=Number(match[4])-Number(match[2])+1}col=[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);row=Number(match[2])}
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- Range objects retain their parent sheet.
  const sheet=this
  const raw=(r,c)=>sheet.cells.get(r+','+c)??''
  return {
   getValues(){return Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>evaluate(raw(row+r,col+c))))},
   getFormulas(){return Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>typeof raw(row+r,col+c)==='string'&&raw(row+r,col+c).startsWith('=')?raw(row+r,col+c):''))},
   getDisplayValues(){return this.getValues().map(row=>row.map(String))},
   getValue(){return this.getValues()[0][0]},getFormula(){return this.getFormulas()[0][0]},
   setValues(values){for(let r=0;r<height;r++)for(let c=0;c<width;c++)sheet.cells.set((row+r)+','+(col+c),values[r][c]);return this},
   setValue(value){return this.setValues([[value]])},setFormula(value){return this.setValue(value)},
   setFormulas(values){return this.setValues(values)},
   clearContent(){return this.setValues(Array.from({length:height},()=>Array(width).fill('')))},
   setBackground(){return this},setFontColor(){return this},setNumberFormat(){return this},
  }
 }
 getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn())}
}
const sheet=new Sheet('NOVEMBRO'),sheets=[sheet]
sheet.getRange('A2').setValue('CORTE');sheet.getRange('B2').setValue(40)
sheet.getRange('A3').setValue('BARBA');sheet.getRange('B3').setValue(35)
sheet.getRange('A4').setValue('PLANO PRATA');sheet.getRange('B4').setValue(68)
sheet.getRange('E3').setValue('CORTE');sheet.getRange('F3').setValue('BARBA')
sheet.getRange('G3').setValue('PLANO PRATA')
sheet.getRange('R3').setValue('PRODUTOS');sheet.getRange('S3').setValue('OUTROS')
sheet.getRange('T3').setValue('DESCONTOS');sheet.getRange('V3').setValue('TOTAL')
sheet.getRange('E22').setValue(7);sheet.getRange('G22').setValue(3)
sheet.getRange('X16').setValue('COMISSÕES');sheet.getRange('X21').setValue('TOTAL')
sheet.getRange('Z21').setValue(100);sheet.getRange('Z4').setValue(1500)
sheet.getRange('AC45').setValue(false)
let locale='en_US'
const book={getSpreadsheetTimeZone:()=>'UTC',getSpreadsheetLocale:()=>locale,getId:()=> 'test-book',getSheets:()=>sheets,getSheetByName:name=>sheets.find(s=>s.name===name),insertSheet:name=>{const next=new Sheet(name);sheets.push(next);return next}}
function evaluate(value){
 if(typeof value!=='string'||!value.startsWith('='))return value
 const match=value.match(/^=(-?[\d.]+|\(-?[\d]+\/[\d]+\))\+SUMIF\('[^']+'!\$A\$2:\$A\$20000[,;]"([^"]+)"[,;]'[^']+'!\$B\$2:\$B\$20000\)$/)
 if(!match)throw new Error('Unexpected mock formula '+value)
 const data=book.getSheetByName('_Machado Dados')
 const delta=[...data.cells.keys()].filter(key=>key.endsWith(',1')&&data.cells.get(key)===match[2]).reduce((sum,key)=>sum+Number(data.cells.get(key.replace(',1',',2'))),0)
 const fraction=match[1].replace(/[()]/g,'').split('/')
 return Number(fraction[0])/Number(fraction[1]??1)+delta
}
let feed={enabled:true,spreadsheet_id:'test-book',year:2026,starts_on:'2026-11-19',mappings:{},resume_cells:[],
 catalog:[{key:'service:cut',name:'Corte de cabelo',price:4000},{key:'package:silver',name:'Plano Prata',price:6800},{key:'service:barba',name:'Barbo terapia',price:3500}],rows:[]}
let ack
const properties=new Map(),requests=[]
const sandbox=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key),setProperty:(key,value)=>properties.set(key,value)})},Date,Utilities:{formatDate(value){return value.toISOString().slice(0,19).replace('T',' ')}},SpreadsheetApp:{getActiveSpreadsheet:()=>book,openById:()=>book,flush(){}},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 UrlFetchApp:{fetch:(url,options)=>{
  requests.push(url)
  if(url.endsWith('/ack'))ack=JSON.parse(options.payload)
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({data:url.endsWith('/feed')?feed:{recorded:true}})}
 }},console})
const code=(await readFile('server/sheets-connector.gs','utf8')).replace('/*MACHADO_CONNECTION*/',JSON.stringify({base:'https://example.invalid',spreadsheetId:'test-book',token:'test-token'}))
vm.runInContext(code,sandbox)
const sync=()=>vm.runInContext('sincronizarMachado()',sandbox)
sync()
assert.equal(sheet.getRange('E22').getValue(),7,'Initial connection preserves historical quantities')
assert.equal(sheet.getRange('G22').getValue(),3,'Historical plan quantities remain intact')
assert.equal(sheet.getRange('Z4').getValue(),1500,'Expenses remain manual')
const bindings=ack.bindings
feed.rows=[{date:'2026-11-19',key:'service:cut',quantity:1,amount:4500},
 {date:'2026-11-19',key:'products',quantity:1,amount:2000},
 {date:'2026-11-19',key:'discounts',quantity:0,amount:500},
 {date:'2026-11-19',key:'tips',quantity:0,amount:200},
 {date:'2026-11-19',key:'commission:pro',quantity:0,amount:1600}]
sync();sync()
assert.equal(ack.bindings,bindings,'Retries do not create duplicate bindings')
assert.equal(sheet.getRange('E22').getValue(),8)
assert.equal(sheet.getRange('R22').getValue(),20)
assert.equal(sheet.getRange('T22').getValue(),5)
assert.equal(sheet.getRange('U22').getValue(),7,'Actual charge correction 5 reais plus 2 reais tip')
assert.equal(sheet.getRange('Z21').getValue(),116,'Paid repasses are added once')
assert.equal(ack.manual_cells.length,0,'Formula metadata must be stored as text, not executed')
sheet.getRange('E22').setValue(99)
feed.rows[0].quantity=2;feed.rows[0].amount=9000
sync()
assert.equal(sheet.getRange('E22').getValue(),99,'Manual override survives subsequent app changes')
assert(ack.manual_cells.some(cell=>cell.a1==='E22'))
feed.resume_cells=[{sheet_id:sheet.id,a1:'E22'}]
sync()
assert.equal(sheet.getRange('E22').getValue(),99,'Explicit resume preserves the current manual value')
feed.resume_cells=[]
feed.rows[0].quantity=3;feed.rows[0].amount=13500
sync()
assert.equal(sheet.getRange('E22').getValue(),100)
feed.catalog.push({key:'service:new',name:'Tratamento novo',price:3000})
feed.rows.push({date:'2026-11-19',key:'service:new',quantity:1,amount:3000})
sync()
assert.equal(sheet.getRange('AD3').getValue(),'Tratamento novo')
assert.equal(sheet.getRange('AD22').getValue(),1)
assert.equal(sheet.getRange('U22').getValue(),47)
feed.rows.push({date:'2026-11-19',key:'package:silver',quantity:1,amount:6800})
sync()
assert.equal(sheet.getRange('G22').getValue(),4,'New registered plan connects to historical column')
feed.enabled=false;feed.rows=[]
sync()
assert.equal(sheet.getRange('G22').getValue(),4,'Pause keeps the current spreadsheet')
feed.enabled=true;sync()
assert.equal(sheet.getRange('G22').getValue(),3,'Removing source contributions is reflected exactly once')
assert.equal(sheet.getRange('Z4').getValue(),1500)
locale='pt_BR'
sync()
assert(sheet.getRange('E22').getFormula().includes(';'),'Brazilian formulas use semicolon separators')
assert.equal(sheet.getRange('E22').getValue(),97,'Locale repair preserves the linked value after source removal')
assert.equal(ack.manual_cells.length,0)
assert.equal(book.getSheetByName('_Machado Dados').getMaxRows(),20000,'Formula ranges must fit the auxiliary grid')
const priceSheet=book.getSheetByName('Serviços e preços');
const priceRow=[...book.getSheetByName('_Machado Catalogo').cells.entries()].find(([key,value])=>key.endsWith(',1')&&value==='service:cut')[0].split(',')[0];
const displayedRow=book.getSheetByName('_Machado Catalogo').getRange(Number(priceRow),2).getValue();
feed.catalog.find(item=>item.key==='service:cut').price=5500;
sync();
assert.equal(priceSheet.getRange(displayedRow,2).getValue(),55,'Catalog changes appear without closing a command or cash drawer');
priceSheet.getRange(displayedRow,2).setValue(49);
feed.catalog.find(item=>item.key==='service:cut').price=6000;
sync();
assert.equal(priceSheet.getRange(displayedRow,2).getValue(),49,'Manual catalog fields remain protected');
feed.catalog.find(item=>item.key==='service:cut').changed_at='2026-11-20T13:00:00Z';
sync();
priceSheet.getRange(displayedRow,5).setValue(new Date('2026-11-20T13:00:00Z'));
sync();
assert.equal(priceSheet.getRange(displayedRow,5).getValue(),'2026-11-20 13:00:00','Dates auto-parsed by Google remain automatic');
assert(!ack.manual_cells.some(c=>c.sheet_id===priceSheet.id&&c.a1==='E'+displayedRow));
const frozenFormula=sheet.getRange('E22').getFormula(),frozenValue=sheet.getRange('E22').getValue();
feed.current_month='2026-12';
feed.rows=[{date:'2026-11-19',key:'service:cut',quantity:300,amount:1800000}];
sync();
assert.equal(sheet.getRange('E22').getFormula(),frozenFormula,'Past months retain formulas');
assert.equal(sheet.getRange('E22').getValue(),frozenValue,'Past months retain published values despite later corrections');
feed.fingerprint='stable-test';sync();
const requestCount=requests.length;
sync();
assert.deepEqual(requests.slice(requestCount).map(url=>url.split('/').at(-1)),['feed','heartbeat'],'Unchanged data does not rewrite the annual workbook');
console.log('PASS spreadsheet connector: history, manual priority, resume, retries, actual prices, discounts, tips, products, repasses, new services/plans, pause and deletions.')
