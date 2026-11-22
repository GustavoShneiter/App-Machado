const fail=(message,status=400)=>Object.assign(new Error(message),{status})
export async function readBusinessHours(client){
 return (await client.query('select weekday,opens_at,closes_at from business_hours order by weekday,opens_at')).rows
}
export async function businessHours(client,actor,body){
 const profile=(await client.query('select role,can_manage_business_hours from profiles where id=$1 and active',[actor])).rows[0]
 if(!profile)throw fail('Entre novamente para continuar.',401)
 if(profile.role==='professional'&&!(await client.query('select 1 from professionals where profile_id=$1 and active',[actor])).rowCount)throw fail('Seu acesso profissional está inativo.',403)
 const administrative=['owner','admin'].includes(profile.role)
 const editable=administrative||profile.can_manage_business_hours
 if(body){
  if(!editable)throw fail('O Gestão precisa autorizar sua conta para alterar os horários.',403)
  if(body.action==='permissions'&&!administrative)throw fail('Somente o Gestão pode conceder permissões.',403)
  const current=(await client.query('select hours_revision from business_settings where id=true for update')).rows[0]
  if(!Number.isInteger(body.revision)||body.revision!==current.hours_revision)throw fail('Os horários foram atualizados por outra conta. Recarregue esta tela antes de salvar.',409)
  if(body.action==='hours'){
   if(!Array.isArray(body.hours)||body.hours.length!==7)throw fail('Confira os sete dias da semana.')
   const seen=new Set()
   for(const row of body.hours){
    if(!Number.isInteger(row.weekday)||row.weekday<1||row.weekday>7||seen.has(row.weekday)||typeof row.closed!=='boolean')throw fail('Confira os dias da semana.')
    seen.add(row.weekday)
    if(!row.closed&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.opens_at??'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.closes_at??'')||row.opens_at>=row.closes_at))throw fail('A abertura precisa ser anterior ao fechamento no mesmo dia.')
   }
   await client.query('delete from business_hours where tenant_id=current_business_id()')
   for(const row of body.hours.filter(row=>!row.closed))await client.query('insert into business_hours(weekday,opens_at,closes_at) values($1,$2,$3)',[row.weekday,row.opens_at,row.closes_at])
  }else if(body.action==='permissions'){
   if(!Array.isArray(body.profile_ids)||body.profile_ids.length>500||body.profile_ids.some(id=>typeof id!=='string'||!/^[-a-f0-9]{36}$/i.test(id)))throw fail('Contas inválidas.')
   const allowed=(await client.query("select p.id from profiles p where p.role='professional' and p.active and exists(select from professionals b where b.profile_id=p.id and b.active)")).rows.map(p=>p.id)
   if(body.profile_ids.some(id=>!allowed.includes(id)))throw fail('Selecione apenas contas profissionais ativas desta unidade.',403)
   await client.query("update profiles set can_manage_business_hours=(id=any($1::uuid[])) where role='professional'",[body.profile_ids])
  }else throw fail('Operação inválida.')
  await client.query('update business_settings set hours_revision=hours_revision+1 where id=true')
  await client.query("insert into audit_logs(actor_profile_id,operation,entity_type,request_summary,result) values($1,$2,'business_hours',$3,'success')",[actor,'business-hours:'+body.action,JSON.stringify(body)])
 }
 return {hours:await readBusinessHours(client),revision:(await client.query('select hours_revision from business_settings where id=true')).rows[0].hours_revision,can_edit:editable,can_delegate:administrative,accounts:administrative?(await client.query("select p.id,coalesce(b.name,p.name) name,u.email,p.can_manage_business_hours from profiles p join auth_user u on u.id=p.id::text join professionals b on b.profile_id=p.id where p.role='professional' and p.active and b.active order by b.name")).rows:[],timezone:'America/Sao_Paulo'}
}
