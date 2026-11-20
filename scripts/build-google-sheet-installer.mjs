import {readFile,writeFile,mkdir} from 'node:fs/promises'
const engine=(await readFile('server/sheets-connector.gs','utf8')).replace('const MACHADO = /*MACHADO_CONNECTION*/;','const MACHADO = {};').replaceAll('LockService.getScriptLock()','LockService.getUserLock()').replaceAll('PropertiesService.getScriptProperties()','PropertiesService.getUserProperties()')
await mkdir('.private/google-installer',{recursive:true})
await writeFile('.private/google-installer/Code.gs',(await readFile('server/sheets-google-installer.gs','utf8'))+'\n'+engine)
await writeFile('.private/google-installer/appsscript.json',JSON.stringify({timeZone:'America/Sao_Paulo',runtimeVersion:'V8',oauthScopes:['openid','https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/script.external_request','https://www.googleapis.com/auth/script.scriptapp','https://www.googleapis.com/auth/userinfo.email'],webapp:{executeAs:'USER_ACCESSING',access:'ANYONE'}},null,2))
console.log('Standalone installer prepared; user-scoped credentials and execution. No live spreadsheet changes.')
