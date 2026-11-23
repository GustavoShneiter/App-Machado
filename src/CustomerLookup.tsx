import {useId,useState} from 'react'
import {matchingCustomers,type CustomerChoice} from './customerSearch'
export function CustomerLookup({customers,name,selected,onName,onSelect,onClear}:{customers:CustomerChoice[];name:string;selected?:CustomerChoice;onName:(name:string)=>void;onSelect:(customer:CustomerChoice)=>void;onClear:()=>void}){
 const id=useId(),[open,setOpen]=useState(false),[active,setActive]=useState(0)
 const matches=name.trim().length>=2&&!selected?matchingCustomers(customers,name):[]
 const shown=matches.slice(0,8),expanded=open&&name.trim().length>=2&&!selected
 const choose=(customer:CustomerChoice)=>{onSelect(customer);setOpen(false);setActive(0)}
 return <div className="customer-lookup" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOpen(false)}}>
  <label className="field"><span>Cliente</span><input role="combobox" aria-autocomplete="list" aria-expanded={Boolean(expanded)} aria-controls={expanded?id:undefined} aria-activedescendant={expanded&&shown.length?`${id}-${Math.min(active,shown.length-1)}`:undefined} autoComplete="off" required minLength={selected?undefined:2} placeholder="Buscar cliente ou digitar novo nome" value={name} onFocus={()=>setOpen(true)} onChange={e=>{onName(e.target.value);setOpen(true);setActive(0)}} onKeyDown={e=>{
   if(e.key==='Escape'&&expanded){e.preventDefault();e.stopPropagation();setOpen(false);return}
   if(['ArrowDown','ArrowUp'].includes(e.key)&&shown.length){e.preventDefault();setOpen(true);setActive(index=>(index+(e.key==='ArrowDown'?1:-1)+shown.length)%shown.length)}
   if(e.key==='Enter'&&expanded&&shown.length){e.preventDefault();choose(shown[Math.min(active,shown.length-1)])}
  }}/></label>
  {selected?<div className="customer-selection"><span>Cadastro selecionado</span><button type="button" className="text-action" onClick={()=>{onClear();setOpen(true)}}>Trocar cliente</button></div>:expanded&&<div className="customer-matches"><div id={id} role="listbox" aria-label="Clientes cadastrados">{shown.map((customer,index)=><button key={customer.id} id={`${id}-${index}`} type="button" role="option" aria-selected={index===active} onClick={()=>choose(customer)}><strong>{customer.name}</strong><small>{customer.phone||'Sem WhatsApp cadastrado'}</small></button>)}</div><p role="status">{matches.length>8?`${matches.length} clientes encontrados. Digite mais para refinar.`:matches.length?`${matches.length} ${matches.length===1?'cliente encontrado':'clientes encontrados'}`:'Nenhum cliente encontrado. Você pode preencher os dados para um novo cadastro.'}</p></div>}
 </div>
}
