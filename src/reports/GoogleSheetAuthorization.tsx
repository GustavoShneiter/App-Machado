import {useEffect,useState} from 'react'
import {ExternalLink,FileSpreadsheet} from 'lucide-react'
import {apiRequest} from '../dataClient'
import './spreadsheet.css'
type State={owner:boolean;available:boolean;google_email:string|null;needs_authorization:boolean;has_workbook:boolean;year:number}
export function GoogleSheetAuthorization({reconnect=false}:{reconnect?:boolean}={}){
 const [status,setStatus]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[url,setUrl]=useState('')
 useEffect(()=>{
  let live=true
  const load=()=>apiRequest<{data:State}>('/sheets/automatic/status').then(r=>{if(live)setStatus(r.data)}).catch(()=>{})
  void load();const focus=()=>void load();window.addEventListener('focus',focus)
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load()},30000)
  return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',focus)}
 },[])
 if(!status?.owner||status.has_workbook&&!reconnect)return null
 return <section className="sheet-google-setup" aria-label="Conectar planilha da unidade">
  <FileSpreadsheet size={22} aria-hidden="true"/><div><h3>{reconnect?'Conta Google da unidade':status.google_email?'Preparando sua planilha':'Sua planilha no Google Drive'}</h3><p>{status.google_email?'A criação está vinculada a '+status.google_email+'. O arquivo aparecerá aqui ao concluir. Se a autorização foi interrompida, reconecte abaixo.':'Autorize o Google uma vez para criar a planilha exclusiva desta unidade. Depois, o app atualiza o mesmo arquivo automaticamente. Cada ano terá sua própria planilha.'}</p>
  {!url?<button className="primary" disabled={busy||!status.available} onClick={async()=>{setBusy(true);setError('');try{const response=await apiRequest<{data:{url:string}}>('/sheets/automatic/authorize',{method:'POST',body:'{}'});setUrl(response.data.url)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?'Preparando…':status.google_email?'Reconectar Google':'Conectar minha conta Google'}</button>:<a className="primary" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={18}/>Autorizar e criar planilha</a>}
  {url&&<button className="text-action" onClick={()=>setUrl('')}>Gerar novo link de autorização</button>}<small>{status.available?'Escolha no Google o mesmo Gmail usado para entrar nesta unidade. Ao concluir, volte ao app.':'A autorização Google está sendo preparada. Você pode usar a gestão normalmente.'}</small>{error&&<p role="alert" className="form-error">{error}</p>}
  </div></section>
}
