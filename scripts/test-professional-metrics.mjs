import { build } from 'esbuild'
import { createRequire } from 'node:module'
const result=await build({stdin:{contents:`
import assert from 'node:assert/strict'
import {weekRange,remaining,progress,estimatedServices} from './src/professional/periods'
assert.deepEqual(weekRange(0,'2026-10-22'),{from:'2026-10-19',to:'2026-10-25'})
assert.deepEqual(weekRange(0,'2026-10-25'),{from:'2026-10-19',to:'2026-10-25'})
assert.deepEqual(weekRange(0,'2026-10-26'),{from:'2026-10-26',to:'2026-11-01'})
assert.deepEqual(weekRange(-1,'2027-01-04'),{from:'2026-12-28',to:'2027-01-03'})
assert.deepEqual(weekRange(0,'2028-02-29'),{from:'2028-02-28',to:'2028-03-05'})
assert.equal(remaining(10000,12000),0);assert.equal(remaining(10000,2500),7500)
assert.equal(progress(0,10000),0);assert.equal(progress(10000,12000),100);assert.equal(progress(10000,2500),25)
assert.equal(estimatedServices(35000,45000,18),14)
assert.equal(estimatedServices(1,45000,18),1)
assert.equal(estimatedServices(10000,0,0),null);assert.equal(estimatedServices(0,45000,18),null)
console.log('PASS metas profissionais: semanas de segunda a domingo, virada do ano, ano bissexto, meta alcançada, comissão média e arredondamento de serviços.')
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',write:false,define:{'import.meta.env':'{}'}})
new Function('require',result.outputFiles[0].text)(createRequire(import.meta.url))
