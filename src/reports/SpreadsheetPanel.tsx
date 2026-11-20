import {useEffect,useState} from 'react'
import {ChevronRight,Download,ExternalLink,FileSpreadsheet,Settings2} from 'lucide-react'
import {apiRequest} from '../dataClient'
import {Modal} from '../ManagementPages'
import {dayKey,dateTime} from '../operations'
import {saveExport} from '../fileExport'
import './spreadsheet.css'

type ManualCell={sheet_id:number;sheet:string;a1:string}
type Connection={spreadsheet_id:string;url:string;year:number;starts_on:string;enabled:boolean;revision:number;
 mappings:Record<string,string>;last_sync_at:string|null;status:null|{manual_cells:ManualCell[];headers:string[];error:string|null;bindings:number}}
type Settings={connections?:Connection[];connection:Connection|null;catalog:{key:string;name:string;price:number}[];owner:boolean}

export function SpreadsheetPanel(){
 const [open,setOpen]=useState(false)
 return <>
  <button type="button" className="report-spreadsheet-link" onClick={()=>setOpen(true)}><FileSpreadsheet size={21}/><span><strong>Planilha de caixa</strong><small>Visualizar, editar ou baixar Excel</small></span><ChevronRight size={18}/></button>
  {open&&<SpreadsheetDialog close={()=>setOpen(false)}/>}
 </>
}
function SpreadsheetDialog({close}:{close:()=>void}){
 const [settings,setSettings]=useState<Settings|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [configuring,setConfiguring]=useState(false),[script,setScript]=useState(''),[notice,setNotice]=useState('')
 const [url,setUrl]=useState(''),[year,setYear]=useState(String(new Date().getFullYear())),[starts,setStarts]=useState(dayKey())
 const [selectedYear,setSelectedYear]=useState('')
 const [enabled,setEnabled]=useState(true),[mappings,setMappings]=useState<Record<string,string>>({})
 async function load(){
  const result=await apiRequest<{data:Settings}>('/sheets/settings'+(selectedYear?'?year='+selectedYear:''))
  setSettings(result.data);setEnabled(result.data.connection?.enabled??true);setMappings(result.data.connection?.mappings??{})
 }
 useEffect(()=>{let active=true;apiRequest<{data:Settings}>('/sheets/settings'+(selectedYear?'?year='+selectedYear:'')).then(result=>{
  if(active){setSettings(result.data);setEnabled(result.data.connection?.enabled??true);setMappings(result.data.connection?.mappings??{})}
 }).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[selectedYear])
 async function run(route:string,body:Record<string,unknown>){
  if(busy)return
  setBusy(true);setError('');setNotice('')
  try{
   const result=await apiRequest<{data:{script?:string}}>('/sheets/'+route,{method:'POST',body:JSON.stringify({...body,year:Number(route==='connect'?body.year:selectedYear||settings?.connection?.year||year)})})
   if(result.data.script)setScript(result.data.script)
   await load();setNotice(route==='resume'?'O campo voltará ao automático na próxima sincronização.':'Configuração salva.')
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 const connection=settings?.connection
 return <Modal title="Planilha de caixa" close={close}><div className="sheet-panel">
  {!settings&&!error&&<p role="status">Carregando a conexão…</p>}
  {settings&&!!settings.connections?.length&&<label className="field"><span>Ano da planilha</span><select aria-label="Ano da planilha conectada" value={selectedYear||String(settings.connection?.year??'')} disabled={busy} onChange={e=>{setSelectedYear(e.target.value);setConfiguring(false);setScript('');setNotice('')}}>{settings.connections.map(c=><option key={c.year} value={c.year}>{c.year}</option>)}</select></label>}
  {connection&&<>
   <p className="sheet-connection-state"><span className={connection.enabled?'sheet-connected':'sheet-paused'}/>{!connection.enabled?'Sincronização pausada':connection.last_sync_at?'Sincronização automática':'Aguardando autorização no Google'}</p>
   <p className="sheet-description">{connection.last_sync_at?'Última sincronização em '+dateTime(connection.last_sync_at):'Instale e autorize o conector nesta planilha para iniciar a atualização automática.'}</p>
   {connection.status?.error&&<p role="alert" className="form-error">{connection.status.error}</p>}
   <div className="sheet-primary-actions">
    <a className="primary" href={connection.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={18}/>Abrir e editar planilha</a>
    <a className="outline" href={'https://docs.google.com/spreadsheets/d/'+connection.spreadsheet_id+'/export?format=xlsx'} target="_blank" rel="noopener noreferrer"><Download size={18}/>Baixar Excel</a>
   </div>
   <p className="sheet-description">A atualização ocorre aproximadamente a cada minuto, inclusive com a comanda aberta. Meses anteriores ficam preservados. Os novos dados entram a partir de {connection.starts_on.slice(0,10).split('-').reverse().join('/')}.</p>
   <section className="sheet-manual-explanation"><h3>Prioridade às alterações manuais</h3><p>Ao alterar um campo vinculado na planilha, ele passa a ser manual. O cadastro atual de serviços aparece na aba Serviços e preços, sem recalcular valores históricos. Você pode reativá-lo abaixo, preservando o valor atual como ponto de partida.</p></section>
   {!!connection.status?.manual_cells.length&&<section><h3>Campos manuais</h3><ul className="sheet-manual-fields">{connection.status.manual_cells.map(cell=><li key={cell.sheet_id+'|'+cell.a1}><span>{cell.sheet} · {cell.a1}</span>{settings?.owner&&<button className="text-action" disabled={busy} onClick={()=>void run('resume',{revision:connection.revision,cell:{sheet_id:cell.sheet_id,a1:cell.a1}})}>Retomar automático</button>}</li>)}</ul></section>}
   {settings?.owner&&<button className="outline" aria-expanded={configuring} onClick={()=>setConfiguring(!configuring)}><Settings2 size={17}/>Configurar sincronização</button>}
   {configuring&&<form className="sheet-settings" onSubmit={e=>{e.preventDefault();void run('settings',{revision:connection.revision,enabled,mappings})}}>
    <label className="sheet-toggle"><span>Sincronização automática</span><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/></label>
    <h3>Serviços e planos</h3><p className="sheet-description">Escolha a coluna correspondente. No modo automático, serviços novos ganham uma coluna própria. Os planos históricos poderão ser vinculados quando forem cadastrados no app.</p>
    {settings?.catalog.filter(item=>!item.key.startsWith('commission:')).map(item=><label className="field" key={item.key}><span>{item.name}</span><select aria-label={'Coluna para '+item.name} value={mappings[item.key]??''} onChange={e=>setMappings({...mappings,[item.key]:e.target.value})}><option value="">Reconhecer ou criar automaticamente</option>{(connection.status?.headers??[]).filter(h=>!['TOTAL','DESCONTOS','PRODUTOS','OUTROS','AJUSTES DO APP'].includes(h.trim().toUpperCase())).map(header=><option key={header} value={header}>{header}</option>)}</select></label>)}
    <button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar configuração'}</button>
    <button className="outline" type="button" disabled={busy} onClick={()=>{if(window.confirm('Gerar um novo conector revoga o anterior. Será necessário instalar o novo código na mesma planilha.'))void run('credentials',{revision:connection.revision})}}>Gerar novo conector</button>
   </form>}
  </>}
  {settings&&!connection&&settings.owner&&<form className="sheet-settings" onSubmit={e=>{e.preventDefault();void run('connect',{spreadsheet_url:url,year:Number(year),starts_on:starts})}}>
   <p>Conecte uma planilha da sua conta Google. Os dados existentes serão a base histórica da integração.</p>
   <label className="field"><span>Link da planilha</span><input required type="url" value={url} placeholder="https://docs.google.com/spreadsheets/d/…" onChange={e=>setUrl(e.target.value)}/></label>
   <label className="field"><span>Ano da planilha</span><input required type="number" min="2020" max="2100" value={year} onChange={e=>setYear(e.target.value)}/></label>
   <label className="field"><span>Início dos novos lançamentos</span><input required type="date" value={starts} onChange={e=>setStarts(e.target.value)}/></label>
   <button className="primary" disabled={busy}>{busy?'Preparando…':'Preparar conexão'}</button>
  </form>}
  {settings&&!connection&&!settings.owner&&<p>O proprietário pode configurar a planilha por esta tela.</p>}
  {script&&<section className="sheet-setup"><h3>Instalar o conector</h3><p>Na planilha, abra Extensões → Apps Script, cole este código e execute instalarMachado. Autorize a conexão na sua conta Google. A atualização será feita aproximadamente a cada minuto.</p><textarea aria-label="Código privado do conector" readOnly value={script}/><button className="outline" onClick={()=>void saveExport('Machado-Planilha.gs',script,'text/plain').catch(e=>setError(e.message))}><Download size={17}/>Salvar conector</button></section>}
  {notice&&<p role="status" className="sheet-notice">{notice}</p>}
  {error&&<p role="alert" className="form-error">{error}</p>}
 </div></Modal>
}
