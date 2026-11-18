import {randomBytes} from 'node:crypto'
import {mkdir,readFile,writeFile,access} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import assert from 'node:assert/strict'
const dir='.private/migration',base='https://app-machado.45-140-203-243.sslip.io'
await mkdir(dir,{recursive:true})
try{await access(dir+'/app.env');throw new Error('Private migration configuration already exists; preserve it instead of regenerating credentials.')}catch(error){if(error.code!=='ENOENT')throw error}
const original=parseEnv(await readFile(dir+'/vercel-production.env','utf8'))
assert(original.BETTER_AUTH_SECRET?.length>=32,'Production authentication secret missing')
const source=new URL(original.DATABASE_URL_UNPOOLED||original.DATABASE_URL)
assert(source.hostname.endsWith('.neon.tech'),'Unexpected source database')
const random=()=>randomBytes(36).toString('base64url'),password=random(),cluster=random(),testToken=random()
const env=values=>Object.entries(values).map(([key,value])=>{assert(!/[\r\n]/.test(String(value)));return key+'='+String(value)}).join('\n')+'\n'
await writeFile(dir+'/cluster-password',cluster,{mode:0o600})
await writeFile(dir+'/app.env',env({DATABASE_URL:`postgresql://neondb_owner:${password}@machado-app-db:5432/machado_stage`,BETTER_AUTH_SECRET:original.BETTER_AUTH_SECRET,AUTH_BASE_URL:base,AGENT_ENABLED:'true',APP_MODE:'staging',MIGRATION_TEST_TOKEN:testToken}),{mode:0o600})
await writeFile(dir+'/source.env',env({PGHOST:source.hostname,PGPORT:source.port||'5432',PGDATABASE:source.pathname.slice(1),PGUSER:decodeURIComponent(source.username),PGPASSWORD:decodeURIComponent(source.password),PGSSLMODE:'verify-full',PGSSLROOTCERT:'/etc/ssl/certs/ca-certificates.crt'}),{mode:0o600})
await writeFile(dir+'/roles.sql',`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;\nCREATE ROLE machado_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;\nGRANT machado_runtime TO neondb_owner;\nCREATE ROLE neon_superuser NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;\nCREATE ROLE cloud_admin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;\nCREATE DATABASE machado_stage OWNER neondb_owner TEMPLATE template0;\n`,{mode:0o600})
await writeFile(dir+'/qa-private.json',JSON.stringify({base,testToken}),{mode:0o600})
console.log('Private migration credentials prepared; production login secret preserved. No values displayed.')
