export const templateDefaults = {
 confirmation:'Olá, {cliente}! Seu agendamento na {barbearia} está confirmado: {servico} com {profissional}, dia {data} às {hora}.',
 reminder_1:'Olá, {cliente}! Faltam {antecedencia} para seu agendamento na {barbearia}: {servico} com {profissional}, dia {data} às {hora}.',
 reminder_2:'Olá, {cliente}! Lembrete do seu horário na {barbearia}: {data} às {hora}, com {profissional}.',
 birthday:'Feliz aniversário, {cliente}! A equipe da {barbearia} deseja um ótimo dia para você!',
 reactivation:'Olá, {cliente}! Sentimos sua falta na {barbearia}. Quando quiser, fale conosco para escolher seu próximo horário.',
};
export const defaultConfig = () => ({assistant_enabled:false,confirmations_enabled:false,reminders_enabled:false,birthday_enabled:false,reactivation_enabled:false,confirmation_delay_minutes:0,reminder_offsets_minutes:[1440],campaign_start_hour:9,campaign_end_hour:19,birthday_send_hour:10,reactivation_days:40,message_templates:Object.fromEntries(Object.entries(templateDefaults).map(([key,text])=>[key,{text,revision:1}]))});
export const actions=['capabilities','settings','catalog','customer_context','availability','prepare_booking','pending_booking','confirm_booking','opt_out','enqueue_campaigns','enqueue_reminders','claim_notification','ack_notification','delivery_update','heartbeat'];
export const deliveryStates=['pending','sending','sent','delivered','read','failed','uncertain','suppressed'];
export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function cleanPhone(value) { let s=String(value||'').replace(/\D/g,''); if(/^55\d{10,11}$/.test(s))s=s.slice(2); if(!/^[1-9]\d{9,10}$/.test(s))throw fail('Informe telefone com DDD.'); return s; }
export function validateTemplate(key,text) {
 if(typeof text!=='string'||!text.trim()||text.length>2000||/[<>]|\b(?:javascript|data|file|vbscript):|```/i.test(text))throw fail('Use texto simples de 1 a 2.000 caracteres.');
 const allowed=['cliente','barbearia',...(!['birthday','reactivation'].includes(key)?['servico','profissional','data','hora']:[]),...(key.startsWith('reminder')?['antecedencia']:[])];
 const rest=text.replace(/\{([a-z_]+)\}/g,(_,name)=>{if(!allowed.includes(name))throw fail('Variável indisponível: '+name);return '';});
 if(/[{}]/.test(rest))throw fail('Confira as variáveis entre chaves.');
 return text.trim();
}
export function validateConfig(input,previous=defaultConfig()) {
 const allowed=Object.keys(previous); if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw fail('Configuração inválida.');
 const c={...previous,...input};
 for(const k of ['assistant_enabled','confirmations_enabled','reminders_enabled','birthday_enabled','reactivation_enabled'])if(typeof c[k]!=='boolean')throw fail('Opção inválida.');
 for(const [k,min,max] of [['confirmation_delay_minutes',0,60],['campaign_start_hour',0,23],['campaign_end_hour',1,24],['birthday_send_hour',0,23],['reactivation_days',0,36500]])if(!Number.isInteger(c[k])||c[k]<min||c[k]>max)throw fail('Confira o valor de '+k+'.');
 if(c.campaign_start_hour>=c.campaign_end_hour||c.birthday_send_hour<c.campaign_start_hour||c.birthday_send_hour>=c.campaign_end_hour)throw fail('Aniversário deve estar dentro da janela de campanhas.');
 const offsets=c.reminder_offsets_minutes;
 if(!Array.isArray(offsets)||offsets.length>2||new Set(offsets).size!==offsets.length||offsets.some(n=>!Number.isInteger(n)||n<60||n>10080))throw fail('Use até dois lembretes diferentes, entre 1 hora e 7 dias.');
 c.reminder_offsets_minutes=[...offsets].sort((a,b)=>b-a);
 if(!c.message_templates||Object.keys(c.message_templates).some(k=>!Object.hasOwn(templateDefaults,k)))throw fail('Textos inválidos.');
 c.message_templates=Object.fromEntries(Object.keys(templateDefaults).map(k=>{const text=validateTemplate(k,c.message_templates[k]?.text);const old=previous.message_templates[k];return [k,{text,revision:old.revision+(old.text!==text?1:0)}];}));
 return c;
}
export function renderMessage(key,template,values) {
 let text=validateTemplate(key,template).replace(/\{([a-z_]+)\}/g,(_,name)=>{if(values[name]==null)throw fail('Dados insuficientes para a mensagem.');return String(values[name]);});
 if(['birthday','reactivation'].includes(key))text+='\n\nSe não quiser receber estas mensagens, responda SAIR.';
 if(text.length>4000)throw fail('Mensagem final excede 4.000 caracteres.');return text;
}
