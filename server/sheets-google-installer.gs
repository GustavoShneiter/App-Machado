// Standalone web app. Deploy as USER_ACCESSING, never as the developer.
// Each Google user owns their files and keeps credentials in UserProperties.
const MACHADO_BASE='https://app-machado.45-140-203-243.sslip.io';
function doGet(e){
 const grant=String(e&&e.parameter&&e.parameter.setup||'');
 if(!/^[A-Za-z0-9_-]{64}$/.test(grant))return HtmlService.createHtmlOutput('<h2>Machado · Planilhas</h2><p>Abra a conexão pelo Menu → Relatórios → Planilha de caixa no aplicativo da sua unidade.</p>');
 const page='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><base target="_top"><style>body{font:16px/1.6 Arial,sans-serif;background:#f7f8fa;color:#1c2925;margin:0;padding:32px 20px}main{max-width:480px;margin:40px auto;background:#fff;padding:28px;border-radius:16px}h1{font-size:25px;line-height:1.3}button,a{display:inline-block;background:#155442;color:#fff;border:0;border-radius:10px;padding:14px 20px;font:700 16px Arial;min-height:48px;text-decoration:none}button:disabled{opacity:.5}#status{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#65716c}</style></head><body><main><h1>Sua planilha, no seu Google Drive</h1><p>Use o mesmo Gmail cadastrado para entrar na sua unidade Machado. A planilha será criada nesta conta e atualizada pelo aplicativo.</p><p>Será um arquivo por unidade e por ano. Entrar novamente não cria outra cópia. As alterações manuais na planilha continuam protegidas.</p><button id="connect" onclick="connect()">Criar minha planilha</button><p id="status" role="status"></p><a id="sheet" hidden>Abrir planilha</a><p><small>Depois de conectar, você pode voltar ao aplicativo. A sincronização funciona aproximadamente a cada minuto.</small></p></main><script>function connect(){document.getElementById("connect").disabled=true;document.getElementById("status").textContent="Criando sua planilha. Aguarde…";google.script.run.withSuccessHandler(function(r){document.getElementById("status").textContent=r.message;var link=document.getElementById("sheet");if(r.url){link.href=r.url;link.hidden=false;}}).withFailureHandler(function(e){document.getElementById("status").textContent=e.message||"Não foi possível conectar. Volte ao aplicativo e tente novamente.";document.getElementById("connect").disabled=false;}).autorizarUnidade('+JSON.stringify(grant)+');}connect();</script></body></html>';
 return HtmlService.createHtmlOutput(page).setTitle('Machado · Conectar planilha');
}
function automaticRequest(path,installation,body){
 const response=UrlFetchApp.fetch(MACHADO_BASE+'/api/sheets/automatic/'+path,{method:'post',contentType:'application/json',payload:JSON.stringify(body||{}),headers:installation?{Authorization:'Bearer '+installation.token}:{},muteHttpExceptions:true});
 const result=JSON.parse(response.getContentText());if(response.getResponseCode()!==200)throw new Error(result.error&&result.error.message||'Revise a conexão pelo aplicativo.');return result.data;
}
function autorizarUnidade(grant){
 if(!/^[A-Za-z0-9_-]{64}$/.test(String(grant)))throw new Error('Abra a conexão pelo aplicativo novamente.');
 const installation=automaticRequest('claim',null,{grant:grant,google_token:ScriptApp.getOAuthToken()});
 const properties=PropertiesService.getUserProperties(),all=JSON.parse(properties.getProperty('machado-installations')||'{}');
 all[installation.unit_id]=installation;properties.setProperty('machado-installations',JSON.stringify(all));
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='sincronizarUnidadesMachado'))ScriptApp.newTrigger('sincronizarUnidadesMachado').timeBased().everyMinutes(1).create();
 sincronizarUnidadesMachado();
 const connections=JSON.parse(properties.getProperty('machado-connections')||'[]'),connection=connections.find(c=>c.unitId===installation.unit_id);
 return {message:connection?'Planilha criada e conectada à sua unidade. Pode voltar ao app.':'Conta autorizada. As planilhas já existentes serão preservadas; os próximos anos serão criados nesta conta.',url:connection?'https://docs.google.com/spreadsheets/d/'+connection.spreadsheetId+'/edit':null};
}
function sincronizarUnidadesMachado(){
 const properties=PropertiesService.getUserProperties(),all=JSON.parse(properties.getProperty('machado-installations')||'{}'),errors=[];
 for(const unitId of Object.keys(all)){
  const installation=all[unitId],lock=LockService.getUserLock();if(!lock.tryLock(1000))continue;
  try{
   const state=automaticRequest('jobs',installation,{});
   if(state.unit_id!==unitId)throw new Error('A conexão retornou outra unidade. Revise pelo aplicativo.');
   const recovered=JSON.parse(properties.getProperty('machado-connections')||'[]');
   for(const linked of state.linked||[]){const index=recovered.findIndex(c=>c.unitId===unitId&&c.year===linked.year),value={base:MACHADO_BASE,unitId:unitId,year:linked.year,spreadsheetId:linked.spreadsheetId,token:linked.token};if(index<0)recovered.push(value);else recovered[index]=value;}
   properties.setProperty('machado-connections',JSON.stringify(recovered));
   for(const job of state.jobs){
    const key='new-book-'+unitId+'-'+job.year;let id=properties.getProperty(key),book;
    if(!id){book=SpreadsheetApp.create('Fluxo de Caixa · '+state.business_name+' · '+job.year);id=book.getId();properties.setProperty(key,id);}else book=SpreadsheetApp.openById(id);
    prepararPlanilhaNova(book,job.year,state.business_name,state.catalog);
    const connection=automaticRequest('complete',installation,{year:job.year,spreadsheet_id:id,google_token:ScriptApp.getOAuthToken()});
    const connections=JSON.parse(properties.getProperty('machado-connections')||'[]');
    if(!connections.some(c=>c.unitId===unitId&&c.year===job.year))connections.push({base:MACHADO_BASE,unitId:unitId,year:job.year,spreadsheetId:id,token:connection.token});
    properties.setProperty('machado-connections',JSON.stringify(connections));
   }
  }catch(error){errors.push(installation.business_name+': '+String(error.message));}finally{lock.releaseLock();}
 }
 for(const connection of JSON.parse(properties.getProperty('machado-connections')||'[]')){try{sincronizarPlanilha(connection);}catch(error){errors.push(String(error.message));}}
 if(errors.length)throw new Error(errors.join(' | '));
}
function literalPlanilha(value){const text=String(value);return /^[=+@-]/.test(text)?"'"+text:text;}
function prepararPlanilhaNova(book,year,business,catalog){
 const properties=PropertiesService.getUserProperties(),ready='template-'+book.getId();if(properties.getProperty(ready)==='ready')return;
 book.setSpreadsheetLocale('pt_BR');book.setSpreadsheetTimeZone('America/Sao_Paulo');
 const items=catalog.filter(item=>!item.key.startsWith('commission:')&&item.active!==false).slice(0,13),months=['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
 let summary=book.getSheetByName('RESUMO');if(!summary){summary=book.getSheets()[0];summary.setName('RESUMO');}
 summary.getRange('A1:D1').merge().setValue(literalPlanilha(business+' · '+year)).setBackground('#155442').setFontColor('#fff').setFontSize(18).setFontWeight('bold');
 summary.getRange('A3:D3').setValues([['Mês','Total dos lançamentos','Repasses pagos','Após repasses']]).setBackground('#d9e6dc').setFontWeight('bold');
 for(let month=1;month<=12;month++){
  const name=months[month-1],sheet=book.getSheetByName(name)||book.insertSheet(name),days=new Date(Date.UTC(year,month,0)).getUTCDate();
  if(sheet.getMaxColumns()<30)sheet.insertColumnsAfter(sheet.getMaxColumns(),30-sheet.getMaxColumns());
  sheet.getRange('A1:V42').clear();sheet.setFrozenRows(3);sheet.setFrozenColumns(4);
  sheet.getRange('D1:V1').merge().setValue(name+' '+year+' · '+business).setBackground('#155442').setFontColor('#fff').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A2:B14').setValues(Array.from({length:13},(_,i)=>[items[i]?literalPlanilha(items[i].name):'',items[i]?items[i].price/100:0]));sheet.getRange('B2:B14').setNumberFormat('"R$" #,##0.00');
  sheet.getRange('C3:V3').setValues([['Dia','Data'].concat(Array.from({length:13},(_,i)=>items[i]?literalPlanilha(items[i].name):''),['PRODUTOS','DESCONTOS','SAÍDAS MANUAIS','AJUSTES DO APP','TOTAL'])]).setBackground('#d9e6dc').setFontWeight('bold').setWrap(true);
  sheet.getRange(4,3,days,20).setValues(Array.from({length:days},(_,i)=>[['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][new Date(Date.UTC(year,month-1,i+1,12)).getUTCDay()],i+1].concat(Array(18).fill(0))));
  sheet.getRange('C4:D34').setNumberFormat('0');sheet.getRange('E4:Q34').setNumberFormat('0');sheet.getRange('R4:V35').setNumberFormat('"R$" #,##0.00');
  for(let day=1;day<=days;day++){const row=day+3;sheet.getRange(row,22).setFormula('='+Array.from({length:13},(_,i)=>coluna(i+5)+row+'*$B$'+(i+2)).join('+')+'+R'+row+'-S'+row+'-T'+row+'+U'+row);}
  sheet.getRange('D35').setValue('TOTAL');for(let col=5;col<=22;col++)sheet.getRange(35,col).setFormula('=SUM('+coluna(col)+'4:'+coluna(col)+(days+3)+')'+(col<=17?'*$B$'+(col-3):''));
  sheet.getRange('C35:V35').setBackground('#155442').setFontColor('#fff').setFontWeight('bold');sheet.getRange('X37').setValue('COMISSÕES');sheet.getRange('X38').setValue('TOTAL');sheet.getRange('Z38').setValue(0).setNumberFormat('"R$" #,##0.00');
  sheet.setColumnWidths(1,2,110);sheet.setColumnWidths(3,2,60);sheet.setColumnWidths(5,18,110);sheet.setRowHeight(3,50);sheet.setTabColor('#155442');
  summary.getRange(month+3,1,1,4).setValues([[name,0,0,0]]);summary.getRange(month+3,2).setFormula("='"+name+"'!V35");summary.getRange(month+3,3).setFormula("='"+name+"'!Z38");summary.getRange(month+3,4).setFormula('=B'+(month+3)+'-C'+(month+3));
 }
 summary.getRange('A16').setValue('TOTAL');for(let col=2;col<=4;col++)summary.getRange(16,col).setFormula('=SUM('+coluna(col)+'4:'+coluna(col)+'15)');summary.getRange('B4:D16').setNumberFormat('"R$" #,##0.00');summary.setColumnWidth(1,140);summary.setColumnWidths(2,3,180);summary.getRange('A16:D16').setBackground('#155442').setFontColor('#fff').setFontWeight('bold');summary.setFrozenRows(3);
 SpreadsheetApp.flush();properties.setProperty(ready,'ready');
}
