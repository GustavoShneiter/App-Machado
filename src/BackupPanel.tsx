import { useEffect, useState } from 'react'
import { apiRequest } from './dataClient'
import { saveExport } from './fileExport'
import { dateTime } from './operations'

export function BackupPanel() {
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [lastBackup,setLastBackup]=useState<string|null>(null)
  useEffect(()=>{void apiRequest('/system-status').then(data=>setLastBackup(data.lastBackup?.created_at??null)).catch(()=>{})},[])
  const backup=async(download:boolean)=>{
    setBusy(true);setMessage('')
    try{
      if(download){const data=await apiRequest('/backup');await saveExport(`Machado-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json');setMessage('Cópia exportada. Guarde o arquivo em local protegido.')}
      else{const data=await apiRequest('/backup',{method:'POST',body:'{}'});setLastBackup(data.createdAt);setMessage('Cópia de segurança salva no armazenamento privado.')}
    }catch(cause){setMessage(cause instanceof Error?cause.message:'Não foi possível criar a cópia.')}
    finally{setBusy(false)}
  }
  return <section className="panel operation-panel"><h3>Cópias de segurança</h3><p>Cópia automática diária. O proprietário também pode salvar uma cópia agora ou exportar um arquivo para guardar em outro local.</p><p>{lastBackup?`Última cópia: ${dateTime(lastBackup)}`:'Consultando a última cópia de segurança.'}</p><div className="backup-actions"><button className="outline" disabled={busy} onClick={()=>void backup(false)}>Salvar cópia agora</button><button className="outline" disabled={busy} onClick={()=>void backup(true)}>Exportar arquivo</button></div>{message&&<p role="status">{message}</p>}</section>
}
