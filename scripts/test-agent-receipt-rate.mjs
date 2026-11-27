import assert from 'node:assert/strict'
import {externalAgent} from '../server/agent.mjs'

const previous=process.env.AGENT_ENABLED
process.env.AGENT_ENABLED='true'
const stopped=new Error('Reached business action')
const requests=new Map([['agent:integration-1',30]])
const pool={
 async query(sql,args){
  if(sql.includes('from agent_integrations i join business_units'))return {rows:[{id:'integration-1',tenant_id:'unit-1',slug:'machado',permissions:['capabilities','delivery_update'],rate_limit_per_minute:30}]}
  if(sql.startsWith('insert into request_limits')){
   const key=args[0],count=(requests.get(key)||0)+1
   requests.set(key,count)
   return {rows:[{requests:count}]}
  }
  throw new Error('Unexpected query')
 }
}
const context={pool,readBody:async req=>({action:req.action,payload:{}}),send:()=>{throw new Error('Unexpected response')},transaction:async()=>{throw stopped}}
const call=async action=>{
 try{await externalAgent({method:'POST',headers:{authorization:'Bearer '+ 'A'.repeat(40)},action},{},context)}
 catch(error){return error}
 throw new Error('Expected request to stop')
}
try{
 assert.equal((await call('capabilities')).status,429,'Customer actions keep their configured rate limit')
 assert.equal(await call('delivery_update'),stopped,'A receipt burst does not consume customer capacity')
 assert.equal(requests.get('agent:delivery:integration-1'),1)
 requests.set('agent:delivery:integration-1',120)
 assert.equal((await call('delivery_update')).status,429,'Receipts retain their own bounded rate limit')
 console.log('PASS agent rate limits: receipts have separate bounded capacity')
}finally{
 if(previous===undefined)delete process.env.AGENT_ENABLED
 else process.env.AGENT_ENABLED=previous
}
