import { readProfessionalPreferences } from './professionals.mjs'

const fail=(message,status=400)=>Object.assign(new Error(message),{status})
const fields=['weekly_commission_goal_cents','weekly_service_goal','weekly_customer_goal']
const limits=[100000000,10000,10000]

export async function adminProfessionalGoals(client,professionalId,values) {
  if(typeof professionalId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(professionalId))throw fail('Selecione um profissional válido.')
  if(!(await client.query('select can_access_admin() allowed')).rows[0]?.allowed)throw fail('Apenas a administração define metas.',403)
  const professional=(await client.query('select id,name from professionals where id=$1',[professionalId])).rows[0]
  if(!professional)throw fail('Profissional não encontrado nesta unidade.',404)
  if(values!==undefined) {
    if(!values||typeof values!=='object'||Array.isArray(values))throw fail('Confira as metas do profissional.')
    for(let i=0;i<fields.length;i++)if(typeof values[fields[i]]!=='number'||!Number.isSafeInteger(values[fields[i]])||values[fields[i]]<0||values[fields[i]]>limits[i])throw fail('Use valores positivos ou zero para deixar uma meta sem definição.')
    await client.query(`insert into professional_preferences(professional_id,weekly_commission_goal_cents,weekly_service_goal,weekly_customer_goal,goals_managed_by_admin,goals_assigned_by,goals_updated_at)
      values($1,$2,$3,$4,true,auth.uid(),now()) on conflict(professional_id) do update set
      weekly_commission_goal_cents=excluded.weekly_commission_goal_cents,weekly_service_goal=excluded.weekly_service_goal,
      weekly_customer_goal=excluded.weekly_customer_goal,goals_managed_by_admin=true,goals_assigned_by=auth.uid(),goals_updated_at=now(),updated_at=now()`,[professionalId,...fields.map(field=>values[field])])
  }
  const preferences=await readProfessionalPreferences(client,professionalId)
  return {professional_id:professional.id,professional_name:professional.name,...Object.fromEntries(fields.map(field=>[field,preferences[field]])),
    goals_managed_by_admin:true,goals_assigned_by:preferences.goals_assigned_by??null,goals_updated_at:preferences.goals_updated_at??null}
}
