export const fixture = {
  blocks: [
    { id:'b1',professional_id:'p1',starts_at:'2026-09-18T13:00:00Z',ends_at:'2026-09-18T14:00:00Z',reason:'Intervalo',created_at:'2026-09-17T12:00:00Z' },
  ],
  appointments: [
    { id:'a1',customer_id:'c1',professional_id:'p1',service_id:'s1',starts_at:'2026-09-18T12:00:00Z',ends_at:'2026-09-18T12:30:00Z',expected_price_cents:4000,status:'completed',source:'instagram',customer_name:'Cliente integrado',customer_phone:'11999990001',professional_name:'Araújo',service_name:'Corte integrado' },
    { id:'a2',customer_id:'c2',professional_id:'p2',service_id:'s1',starts_at:'2026-09-18T13:00:00Z',ends_at:'2026-09-18T13:30:00Z',expected_price_cents:4000,status:'completed',source:'panel',customer_name:'Cliente Machado',customer_phone:'11999990002',professional_name:'Machado',service_name:'Corte integrado' },
    { id:'a3',customer_id:'c1',professional_id:'p1',service_id:'s1',starts_at:'2026-09-18T14:00:00Z',ends_at:'2026-09-18T14:30:00Z',expected_price_cents:4000,status:'cancelled',source:'instagram',customer_name:'Cliente integrado',customer_phone:'11999990001',professional_name:'Araújo',service_name:'Corte integrado' },
  ],
  customers:[{id:'c1',name:'Cliente integrado',phone:'11999990001',notes:null},{id:'c2',name:'Cliente Machado',phone:'11999990002',notes:null}],
  commands:[{id:'cmd1',appointment_id:'a1',customer_id:'c1',status:'closed',discount_cents:0,surcharge_cents:0,created_at:'2026-09-18T12:00:00Z',closed_at:'2026-09-18T15:00:00Z'},{id:'cmd2',appointment_id:'a2',customer_id:'c2',status:'awaiting_payment',discount_cents:0,surcharge_cents:0,created_at:'2026-09-18T12:00:00Z',closed_at:null}],
  items:[{id:'i1',command_id:'cmd1',type:'service',service_id:'s1',product_id:null,professional_id:'p1',description:'Corte integrado',unit_price_cents:4000,quantity:1,commission_cents:1600},{id:'i2',command_id:'cmd2',type:'service',service_id:'s1',product_id:null,professional_id:'p2',description:'Corte integrado',unit_price_cents:4000,quantity:1,commission_cents:0}],
  payments:[{id:'pay1',command_id:'cmd1',method:'pix',amount_cents:4000,paid_at:'2026-09-18T15:00:00Z',reversed_at:null}],
  commissions:[{id:'e1',command_item_id:'i1',professional_id:'p1',gross_cents:4000,commission_cents:1600,status:'pending',paid_at:null,created_at:'2026-09-18T14:00:00Z'}],
  sessions:[{id:'cash1',opened_at:'2026-09-18T11:00:00Z',opening_balance_cents:10000,closed_at:null,declared_balance_cents:null,notes:null}],
  movements:[{id:'m1',session_id:'cash1',type:'sale',amount_cents:4000,payment_method:'pix',notes:'Recebimento',created_at:'2026-09-18T15:00:00Z',command_id:'cmd1',commission_entry_id:null},{id:'m2',session_id:'cash1',type:'expense',amount_cents:-1000,payment_method:'cash',notes:'Material',created_at:'2026-09-18T15:00:00Z',command_id:null,commission_entry_id:null}],
  products:[{id:'product1',name:'Pomada',category:'Finalização',quantity:5,minimum_quantity:2,sale_price_cents:3500,cost_cents:1500,active:true}],
  packages:[],
  packageSales:[{id:'sale1',package_id:'pkg1',customer_id:'c1',package_name:'Plano 2 cabelos',customer_name:'Cliente integrado',amount_cents:7000,method:'pix',status:'active',sold_at:'2026-09-17T12:00:00Z',balances:[{service_id:'s1',service_name:'Corte integrado',total:2,remaining:1}]}],
  packageRedemptions:[],
  business:[],
}
