/** @OnlyCurrentDoc */
// Machado. This connector reads one unit's financial feed and writes this workbook.
// Manual edits replace a linked formula. Scheduled sync never reinstalls that formula.
const MACHADO = /*MACHADO_CONNECTION*/;
const DATA_SHEET = '_Machado Dados';
const CONTROL_SHEET = '_Machado Controle';
const MONTHS = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

function instalarMachado() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book || book.getId() !== MACHADO.spreadsheetId) throw new Error('Abra o script vinculado à planilha configurada.');
  sincronizarMachado();
  const installed = ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'sincronizarMachado');
  if (!installed) ScriptApp.newTrigger('sincronizarMachado').timeBased().everyMinutes(1).create();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Machado')
    .addItem('Sincronizar agora', 'sincronizarMachado')
    .addToUi();
}

function requestMachado(path, data) {
  const options = {method: data ? 'post' : 'get', muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + MACHADO.token}};
  if (data) { options.contentType = 'application/json'; options.payload = JSON.stringify(data); }
  const response = UrlFetchApp.fetch(MACHADO.base + '/api/sheets/' + path, options);
  if (response.getResponseCode() !== 200) throw new Error('A conexão Machado precisa ser revisada no app. Código ' + response.getResponseCode());
  return JSON.parse(response.getContentText()).data;
}

function normalizar(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function coluna(index) {
  let value = index, result = '';
  while (value > 0) { result = String.fromCharCode(65 + (value - 1) % 26) + result; value = Math.floor((value - 1) / 26); }
  return result;
}
function numero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function vinculoFormula(base, key) {
  const start = typeof base === 'string' && base[0] === '=' ? '(' + base.slice(1) + ')' : String(numero(base));
  return '=' + start + '+SUMIF(\'' + DATA_SHEET + '\'!$A$2:$A$20000,"' + key.replace(/"/g, '""') + '",\'' + DATA_SHEET + '\'!$B$2:$B$20000)';
}
function destinoPadrao(name, headers) {
  const normalized = normalizar(name);
  const aliases = {
    CORTEDECABELO: ['CORTE'], CORTEMASCULINO: ['CORTE'], BARBAEXPRESSA: ['BARBAEXPRESS'],
    BARBOTERAPIA: ['BARBA'], ACABAMENTO: ['ACABAMENTO','PEZINHO'],
    DEPILACAONARIZ: ['DEPILACAO'], DEPILACAOORELHA: ['DEPILACAO']
  };
  const names = [normalized].concat(aliases[normalized] || []);
  return headers.find(header => names.indexOf(normalizar(header)) >= 0) || name;
}
function novaAba(book, name, headings) {
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.getRange(1, 1, 1, headings.length).setValues([headings]);
    sheet.hideSheet();
  }
  return sheet;
}
function salvarControles(sheet, controls) {
  if (!controls.length) return;
  if (sheet.getMaxRows() < controls.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), controls.length + 1 - sheet.getMaxRows());
  // Store formula text as JSON so Sheets never executes metadata as a formula.
  sheet.getRange(2, 1, controls.length, 5).setValues(controls.map(row => row.slice(0,4).concat([JSON.stringify(row[4])])));
}

function sincronizarMachado() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  let book;
  try {
    const feed = requestMachado('feed');
    if (feed.spreadsheet_id !== MACHADO.spreadsheetId) throw new Error('A conexão aponta para outra planilha.');
    if (!feed.enabled) return;
    book = SpreadsheetApp.getActiveSpreadsheet();
    if (!book || book.getId() !== MACHADO.spreadsheetId) throw new Error('Execute o conector vinculado à planilha configurada.');
    const dataSheet = novaAba(book, DATA_SHEET, ['Chave','Valor']);
    const controlSheet = novaAba(book, CONTROL_SHEET, ['Página','Célula','Chave','Base original','Fórmula esperada']);
    const storedControls = controlSheet.getLastRow() > 1 ? controlSheet.getRange(2, 1, controlSheet.getLastRow() - 1, 5).getValues() : [];
    const controls = storedControls.map(row => row.slice(0,4).concat([JSON.parse(row[4])]));
    const controlsByCell = new Map(controls.map(row => [row[0] + '|' + row[1], row]));
    const totals = new Map(), headersSeen = new Set(), manualCells = [], resumed = [];
    const add = (key, value) => totals.set(key, (totals.get(key) || 0) + value);
    const catalog = new Map(feed.catalog.map(item => [item.key, item]));
    const resume = new Set(feed.resume_cells.map(cell => cell.sheet_id + '|' + cell.a1));
    const monthSheets = book.getSheets().filter(sheet => MONTHS.indexOf(normalizar(sheet.getName()) === 'MARCO' ? 'MARÇO' : sheet.getName().toUpperCase()) >= 0);
    for (const sheet of monthSheets) {
      const month = MONTHS.indexOf(sheet.getName().toUpperCase()) + 1;
      const monthKey = feed.year + '-' + String(month).padStart(2, '0');
      if (monthKey < feed.starts_on.slice(0, 7)) continue;
      const values = sheet.getDataRange().getValues();
      const formulas = sheet.getDataRange().getFormulas();
      const headers = values[2].map(String);
      headers.filter(Boolean).forEach(header => headersSeen.add(header));
      const productsColumn = headers.findIndex(value => normalizar(value) === 'PRODUTOS') + 1;
      const discountsColumn = headers.findIndex(value => normalizar(value) === 'DESCONTOS') + 1;
      const totalColumn = headers.findIndex(value => normalizar(value) === 'TOTAL') + 1;
      if (!productsColumn || !discountsColumn || !totalColumn) throw new Error('Revise os cabeçalhos de ' + sheet.getName() + '.');
      const adjustmentColumn = totalColumn - 1;
      if (!headers[adjustmentColumn - 1]) sheet.getRange(3, adjustmentColumn).setValue('AJUSTES DO APP');
      const rows = feed.rows.filter(row => row.date.slice(0, 7) === monthKey);
      const sources = feed.catalog.filter(item => !item.key.startsWith('commission:'));
      const columnFor = new Map();
      let lastColumn = Math.max(headers.length, sheet.getLastColumn());
      for (const item of sources) {
        const chosen = feed.mappings[item.key] || destinoPadrao(item.name, headers);
        let col = headers.findIndex(value => normalizar(value) === normalizar(chosen)) + 1;
        const hasChanges = rows.some(row => row.key === item.key);
        if (!col && !hasChanges) continue;
        if (!col) {
          col = ++lastColumn;
          if (col > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), col - sheet.getMaxColumns());
          sheet.getRange(3, col).setValue(chosen.startsWith('=') ? "'" + chosen : chosen);
          sheet.getRange(3, col, 32, 1).setBackground('#edf4ef').setFontColor('#163e30');
          sheet.setColumnWidth(col, 150);
          headers[col - 1] = chosen;
          headersSeen.add(chosen);
        }
        if (col <= 4 || col === productsColumn || col === discountsColumn || col >= productsColumn && col < totalColumn)
          throw new Error('O vínculo de ' + item.name + ' precisa apontar para uma coluna de serviço ou plano.');
        columnFor.set(item.key, {col, key: normalizar(chosen)});
      }
      for (const row of rows) {
        const dateKey = row.date + '|';
        if (row.key === 'products') { add(dateKey + 'products', row.amount / 100); continue; }
        if (row.key === 'discounts') { add(dateKey + 'discounts', row.amount / 100); continue; }
        if (row.key === 'tips') { add(dateKey + 'adjustments', row.amount / 100); continue; }
        if (row.key.startsWith('commission:')) { add(monthKey + '|commissions', row.amount / 100); continue; }
        const destination = columnFor.get(row.key);
        if (!destination || !catalog.has(row.key)) throw new Error('Configure o vínculo de um serviço removido no aplicativo.');
        add(dateKey + destination.key, row.quantity);
        // Existing columns still multiply the month's original prices.
        // This adjustment preserves historical prices and reconciles new actual charges.
        const templatePrice = destination.col < productsColumn && destination.col >= 5
          ? numero(values[destination.col - 4]?.[1]) : 0;
        add(dateKey + 'adjustments', (row.amount - row.quantity * templatePrice * 100) / 100);
      }
      const desired = new Map();
      const lastDay = new Date(feed.year, month, 0).getDate();
      for (let day = 1; day <= lastDay; day++) {
        const date = monthKey + '-' + String(day).padStart(2, '0');
        if (date < feed.starts_on) continue;
        const row = day + 3;
        for (const destination of columnFor.values()) desired.set(coluna(destination.col) + row, {row, col: destination.col, key: date + '|' + destination.key});
        for (const [col, key] of [[productsColumn,'products'],[discountsColumn,'discounts'],[adjustmentColumn,'adjustments']])
          desired.set(coluna(col) + row, {row, col, key: date + '|' + key});
      }
      const commissionRow = values.findIndex(row => row.some(cell => normalizar(cell) === 'COMISSOES'));
      if (commissionRow >= 0) {
        const labelColumn = values[commissionRow].findIndex(cell => normalizar(cell) === 'COMISSOES');
        const subtotalRow = values.findIndex((row,index) => index > commissionRow && index <= commissionRow + 8 && normalizar(row[labelColumn]) === 'TOTAL');
        if (subtotalRow >= 0) {
          const col = labelColumn + 3, row = subtotalRow + 1;
          desired.set(coluna(col) + row, {row, col, key: monthKey + '|commissions'});
        }
      }
      const pendingColumns = new Map();
      for (const [a1, target] of desired) {
        const cellKey = sheet.getSheetId() + '|' + a1;
        if (controlsByCell.has(cellKey)) continue;
        const originalFormula = formulas[target.row - 1]?.[target.col - 1] || '';
        const originalValue = values[target.row - 1]?.[target.col - 1] ?? '';
        if (!originalFormula && originalValue !== '' && typeof originalValue !== 'number')
          continue; // A note or custom text is a manual field.
        const base = originalFormula || numero(originalValue);
        const expected = vinculoFormula(base, target.key);
        const control = [sheet.getSheetId(), a1, target.key, JSON.stringify(base), expected];
        controls.push(control); controlsByCell.set(cellKey, control);
        if (!pendingColumns.has(target.col)) pendingColumns.set(target.col, []);
        pendingColumns.get(target.col).push({row: target.row, formula: expected});
      }
      // Persist intent first. An interrupted setup leaves cells protected as manual.
      salvarControles(controlSheet, controls);
      for (const [col, targets] of pendingColumns) {
        targets.sort((a,b) => a.row - b.row);
        const contiguous = targets.every((target,index) => target.row === targets[0].row + index);
        if (contiguous) sheet.getRange(targets[0].row, col, targets.length, 1).setFormulas(targets.map(target => [target.formula]));
        else for (const target of targets) sheet.getRange(target.row, col).setFormula(target.formula);
      }
    }
    const data = [...totals].map(([key,value]) => [key, Math.round(value * 100) / 100]);
    if (data.length > 19999) throw new Error('A base desta planilha atingiu o limite. Configure uma planilha para o próximo período.');
    if (dataSheet.getMaxRows() < data.length + 1) dataSheet.insertRowsAfter(dataSheet.getMaxRows(), data.length + 1 - dataSheet.getMaxRows());
    if (data.length) dataSheet.getRange(2, 1, data.length, 2).setValues(data);
    const extra = dataSheet.getLastRow() - data.length - 1;
    if (extra > 0) dataSheet.getRange(data.length + 2, 1, extra, 2).clearContent();
    const sheetsById = new Map(book.getSheets().map(sheet => [sheet.getSheetId(), sheet]));
    const formulaMatrices = new Map();
    for (const control of controls) {
      const sheet = sheetsById.get(Number(control[0]));
      if (!sheet) continue;
      if (!formulaMatrices.has(sheet.getSheetId())) formulaMatrices.set(sheet.getSheetId(), sheet.getDataRange().getFormulas());
      const coordinates = control[1].match(/^([A-Z]+)(\d+)$/);
      const columnIndex = coordinates[1].split('').reduce((value,letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const matrix = formulaMatrices.get(sheet.getSheetId());
      if (matrix[Number(coordinates[2]) - 1]?.[columnIndex] === control[4]) continue;
      const identity = {sheet_id: sheet.getSheetId(), sheet: sheet.getName(), a1: control[1]};
      if (resume.has(control[0] + '|' + control[1])) {
        const cell = sheet.getRange(control[1]);
        if (cell.getFormula() || typeof cell.getValue() !== 'number') {
          manualCells.push(identity); continue;
        }
        const base = cell.getValue() - (totals.get(control[2]) || 0);
        control[3] = JSON.stringify(base); control[4] = vinculoFormula(base, control[2]);
        cell.setFormula(control[4]); resumed.push({sheet_id: identity.sheet_id, a1: identity.a1});
      } else manualCells.push(identity);
    }
    salvarControles(controlSheet, controls);
    requestMachado('ack', {spreadsheet_id: MACHADO.spreadsheetId, manual_cells: manualCells.slice(0,500),
      bindings: controls.length, headers: [...headersSeen], resumed});
  } catch (error) {
    try { requestMachado('ack', {spreadsheet_id: MACHADO.spreadsheetId, manual_cells: [], bindings: 0, error: String(error.message).slice(0,500)}); } catch (_) {}
    throw error;
  } finally { lock.releaseLock(); }
}
