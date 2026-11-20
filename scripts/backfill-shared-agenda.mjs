import {pool,transaction} from '../server/db.mjs'
let restored=0
try{
 const owners=(await pool.query("select distinct on (tenant_id) id,tenant_id from profiles where role='owner' and active order by tenant_id,id")).rows
 for(const owner of owners)await transaction(owner.id,async client=>{
  const commands=(await client.query("select id from commands where group_id<>id and appointment_id is null and status in ('open','awaiting_payment') and exists(select 1 from command_items i where i.command_id=commands.id and i.type='service') order by id")).rows
  for(const row of commands){await client.query('select sync_shared_command_agenda($1)',[row.id]);restored++}
 })
 console.log(JSON.stringify({restoredSharedAppointments:restored}))
}finally{await pool.end()}
