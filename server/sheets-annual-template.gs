// Run once before the new year. Copy source formatting without moving its data.
function prepararAnoMachado(sourceId,destinationId,year) {
  if(sourceId===destinationId||year<=new Date().getFullYear())throw new Error('Escolha uma planilha nova e um ano futuro.');
  const properties=PropertiesService.getScriptProperties(),key='annual-template-'+destinationId;
  const source=SpreadsheetApp.openById(sourceId),target=SpreadsheetApp.openById(destinationId);
  if(properties.getProperty(key)==='complete')return conferirAnoMachado(target,year);
  const template=source.getSheetByName('NOVEMBRO');
  if(!template)throw new Error('Modelo mensal não encontrado.');
  for(let month=1;month<=12;month++){
    const name=MONTHS[month-1],marker=key+'-'+month;
    if(properties.getProperty(marker)==='complete')continue;
    const previous=target.getSheetByName(name);
    if(previous&&previous.getRange('E4:U34').getValues().some(row=>row.some(value=>typeof value==='number'&&value!==0)))
      throw new Error('A planilha de destino já contém lançamentos. Preserve-os antes de preparar o ano.');
    const original=source.getSheets().find(sheet=>normalizar(sheet.getName())===normalizar(name))||template;
    const sheet=original.copyTo(target);
    sheet.setName('_Preparando '+month);
    const days=new Date(year,month,0).getDate();
    sheet.getRange('C1').setValue(name+' '+year);
    sheet.getRange('C4:U34').clearContent();
    sheet.getRange('C4:D'+(days+3)).setValues(Array.from({length:days},(_,day)=>[
      Utilities.formatDate(new Date(Date.UTC(year,month-1,day+1,12)),'America/Sao_Paulo','EEE'),day+1]));
    sheet.getRange('E4:U'+(days+3)).setValues(Array.from({length:days},()=>Array(17).fill(0)));
    sheet.getRange('V4:V34').clearContent();
    const separator=['pt','es','de','fr','it'].indexOf(target.getSpreadsheetLocale().split(/[_-]/)[0])>=0?';':',';
    for(let day=1;day<=days;day++){
      const row=day+3;
      sheet.getRange(row,22).setFormula('='+Array.from({length:13},(_,i)=>coluna(i+5)+row+'*$B$'+(i+2)).join('+')+'+R'+row+'+S'+row+'-T'+row+'+U'+row);
    }
    for(let col=5;col<=22;col++)sheet.getRange(35,col).setFormula('=SUM('+coluna(col)+'4:'+coluna(col)+(days+3)+')'+(col<=17?'*$B$'+(col-3):''));
    // Remove the pink expense/maintenance/investment areas only in the new copy.
    sheet.getRange('X2:AC15').clear();sheet.getRange('AA16:AC34').clear();sheet.getRange('X22:Z34').clear();
    sheet.getRange('X17:Z20').clearContent();sheet.getRange('Z21').setFormula('=SUM(Z17:Z20)');
    sheet.getRange('D38:Q39').clearContent();
    sheet.getRange('D38:Q38').setFormulas([Array.from({length:14},(_,i)=>'='+coluna(i+5)+'35')]);
    sheet.getRange('D39:P39').setFormulas([Array.from({length:13},(_,i)=>'=SUM('+coluna(i+5)+'4:'+coluna(i+5)+(days+3)+')')]);
    sheet.getRange('R38').setFormula('=U35');sheet.getRange('S38').setFormula('=V35');
    sheet.getRange('T38').setFormula('=IFERROR(S38/S39'+separator+'0)');
    sheet.getRange('X38').setFormula('=IFERROR(W39/S39'+separator+'0)');
    sheet.getRange('T42').setValue(0);sheet.getRange('U42').setFormula('=IFERROR(S42/T42'+separator+'0)');
    sheet.getRange('W44').setValue(0);
    if(previous)target.deleteSheet(previous);
    sheet.setName(name);target.setActiveSheet(sheet);target.moveActiveSheet(month);
    properties.setProperty(marker,'complete');
  }
  target.setActiveSheet(target.getSheetByName('JANEIRO'));
  SpreadsheetApp.flush();properties.setProperty(key,'complete');conferirAnoMachado(target,year);
}

function conferirAnoMachado(target,year){
  if(year<=new Date().getFullYear())throw new Error('A conferência de preparação só pode ser feita antes do ano começar.');
  const separator=target.getSpreadsheetLocale().startsWith('pt')?';':',';
  for(const sheet of target.getSheets()){
    if(!MONTHS.includes(sheet.getName())){
      // Some XLSX importers normalize the cedilla differently. Remove only a
      // blank March duplicate produced by this preparation workflow.
      if(!sheet.getName().startsWith('MAR')||sheet.getRange('E4:U34').getValues().some(row=>row.some(v=>typeof v==='number'&&v!==0)))
        throw new Error('Há uma aba adicional a revisar: '+sheet.getName());
      target.deleteSheet(sheet);continue;
    }
    sheet.getRange('X38').setFormula('=IFERROR(W39/S39'+separator+'0)');
  }
  SpreadsheetApp.flush();
  if(target.getSheets().length!==12)throw new Error('Confira os doze meses do novo ano.');
  for(const sheet of target.getSheets()){
    if(sheet.getRange('E4:U34').getValues().some(row=>row.some(v=>typeof v==='number'&&v!==0)))throw new Error('Existem lançamentos em '+sheet.getName());
    if(sheet.getDataRange().getDisplayValues().some(row=>row.some(v=>/^#(ERROR!|REF!|DIV\/0!|VALUE!|NAME\?)/.test(v))))throw new Error('Confira as fórmulas de '+sheet.getName());
  }
}
