import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { backend, apiRequest } from './dataClient'

export default function RecoveryPage() {
  const [checking,setChecking]=useState(true)
  const [hasSession,setHasSession]=useState(false)
  const [email,setEmail]=useState('')
  const [code,setCode]=useState('')
  const [currentPassword,setCurrentPassword]=useState('')
  const [password,setPassword]=useState('')
  const [confirmation,setConfirmation]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  useEffect(()=>{
    let active=true
    void backend.auth.getSession().then(({data})=>{if(active)setHasSession(Boolean(data.session))}).catch(()=>{if(active)setError('Confira sua conexão com a internet.')}).finally(()=>{if(active)setChecking(false)})
    return()=>{active=false}
  },[])
  const submit=async(event:FormEvent)=>{
    event.preventDefault(); if(busy)return
    setError('');setMessage('')
    if(!navigator.onLine){setError('Reconecte à internet para continuar.');return}
    if(password.length<12||password!==confirmation){setError(password.length<12?'Use pelo menos 12 caracteres.':'As senhas precisam ser iguais.');return}
    setBusy(true)
    try{
      if(hasSession) await apiRequest('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword:password,revokeOtherSessions:true})})
      else await apiRequest('/recovery',{method:'POST',body:JSON.stringify({email:email.trim(),code:code.replace(/[\s-]/g,''),password})})
      setMessage('Senha atualizada. Os outros acessos foram encerrados. Entre no painel com sua nova senha.')
      setPassword('');setConfirmation('');setCurrentPassword('');setCode('')
    }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível atualizar a senha.')}
    finally{setBusy(false)}
  }
  return <main className="auth-shell"><form className="auth-card" onSubmit={submit}><span className="brand-mark">BM</span><h1>{hasSession?'Alterar senha':'Recuperar acesso'}</h1>
    {checking?<p role="status">Verificando acesso…</p>:<>
      {hasSession?<label className="field"><span>Senha atual</span><input type="password" required autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>:<><p>Use um dos códigos de recuperação entregues ao proprietário. Cada código pode ser utilizado uma única vez.</p><label className="field"><span>E-mail da conta</span><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field"><span>Código de recuperação</span><input required autoComplete="off" value={code} onChange={e=>setCode(e.target.value)}/></label></>}
      <label className="field"><span>Nova senha</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <label className="field"><span>Repita a nova senha</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
      <p>Use pelo menos 12 caracteres.</p>{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
      <button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar nova senha'}</button>
    </>}<Link to="/admin">Voltar ao painel</Link>
  </form></main>
}
