import type {Appointment} from './operations'
export function resolveAgendaProfessionals(requested:string[]|null,available:string[],fallback:string){
 const valid=available.filter(id=>requested?.includes(id))
 return valid.length?valid:available.includes(fallback)?[fallback]:available.slice(0,1)
}
export function agendaLanes(rows:Appointment[]){
 const lanes=new Map<string,{column:number;columns:number}>()
 for(const professional of new Set(rows.map(row=>row.professional_id))){
  let cluster:Appointment[]=[],clusterEnd=0
  const finish=()=>{
   const ends:number[]=[]
   for(const entry of cluster){const start=Date.parse(entry.starts_at);let column=ends.findIndex(end=>end<=start);if(column<0)column=ends.length;ends[column]=Date.parse(entry.ends_at);lanes.set(entry.id,{column,columns:0})}
   for(const entry of cluster)lanes.get(entry.id)!.columns=ends.length
   cluster=[]
  }
  for(const entry of rows.filter(a=>a.professional_id===professional).sort((a,b)=>a.starts_at.localeCompare(b.starts_at))){
   const start=Date.parse(entry.starts_at)
   if(cluster.length&&start>=clusterEnd)finish()
   cluster.push(entry);clusterEnd=Math.max(cluster.length===1?0:clusterEnd,Date.parse(entry.ends_at))
  }
  finish()
 }
 return lanes
}
