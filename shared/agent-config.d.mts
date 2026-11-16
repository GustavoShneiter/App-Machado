export type TemplateKey = 'confirmation'|'reminder_1'|'reminder_2'|'birthday'|'reactivation';
export type AgentConfig = {assistant_enabled:boolean;confirmations_enabled:boolean;reminders_enabled:boolean;birthday_enabled:boolean;reactivation_enabled:boolean;confirmation_delay_minutes:number;reminder_offsets_minutes:number[];campaign_start_hour:number;campaign_end_hour:number;birthday_send_hour:number;reactivation_days:number;message_templates:Record<TemplateKey,{text:string;revision:number}>};
export const templateDefaults:Record<TemplateKey,string>;
export function defaultConfig():AgentConfig;
export function validateConfig(input:unknown,previous?:AgentConfig):AgentConfig;
export function renderMessage(key:TemplateKey,template:string,values:Record<string,string>):string;
