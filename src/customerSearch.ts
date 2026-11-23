export type CustomerChoice={id:string;name:string;phone:string}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim()
export function matchingCustomers(customers:CustomerChoice[],query:string){
 const words=normalize(query).split(/\s+/).filter(Boolean)
 if(!words.length)return []
 return customers.filter(customer=>{
  const text=normalize(customer.name+' '+customer.phone.replace(/\D/g,''))
  return words.every(word=>text.includes(word))
 }).sort((a,b)=>Number(normalize(b.name).startsWith(normalize(query)))-Number(normalize(a.name).startsWith(normalize(query)))||a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id))
}
