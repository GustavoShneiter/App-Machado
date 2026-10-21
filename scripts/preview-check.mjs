import { createServer } from "vite";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

// Preview exclusivo de QA, servido apenas em localhost. Não altera a autenticação publicada.
const server = await createServer({
  server: { host: "127.0.0.1", port: 5188, strictPort: true },
  plugins: [
    {
      name: "qa-local-context",
      enforce: "pre",
      transform(source, id) {
        if (id.endsWith("/src/OperationsStore.tsx"))
          return source + "\nexport { Context as TestContext };";
        if (id.endsWith("/src/CatalogStore.tsx"))
          return source + "\nexport { CatalogContext as TestCatalog };";
      },
      configureServer(vite) {
        vite.middlewares.use("/__qa", async (req, res) => {
          const count=Math.max(1,Math.min(15,Number(new URL(req.url,'http://127.0.0.1').searchParams.get('professionals'))||2));
          const fixture = await readFile(
            new URL("./operations-fixture.mjs", import.meta.url),
            "utf8",
          );
          const html = await vite.transformIndexHtml(
            "/__qa",
            `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="qa-professionals" content="${count}"/></head><body><div id="root"></div><script type="module">
          import React from 'react';
          import {createRoot} from 'react-dom/client';
          import {MemoryRouter,Route,Routes} from 'react-router-dom';
          import {AdminLayout} from '/src/App.tsx';
          import {TestContext} from '/src/OperationsStore.tsx';
          import {TestCatalog} from '/src/CatalogStore.tsx';
          import '/src/styles.css';
          import '/src/navigation-119.css';
          import '/src/dialog-layout.css';
          ${fixture.replace("export const fixture", "const fixture")}
          const catalog={services:[{id:'s1',nome:'Corte integrado',descricao:'Corte',preco:40,duracao:30,ativo:true,cor:'#203F20',comissaoPadrao:50,comissoes:{p1:40,p2:0}}],professionals:[{id:'p1',nome:'Araújo',ativo:true,cor:'#203F20',iniciais:'A',especialidades:'Cortes',telefone:''},{id:'p2',nome:'Machado',ativo:true,cor:'#203F20',iniciais:'M',especialidades:'Cortes',telefone:''}],loading:false,error:'',updateService:async()=>null,addService:async()=>null,updateProfessional:async()=>null,addProfessional:async()=>null,deleteService:async()=>null,deleteProfessional:async()=>null};
          catalog.professionals=Array.from({length:Number(document.querySelector('meta[name="qa-professionals"]').content)},(_,index)=>catalog.professionals[index]??{id:'p'+(index+1),nome:'Profissional '+(index+1),ativo:true,cor:'#203F20',iniciais:String(index+1),especialidades:'Cortes',telefone:''});
          const value={data:fixture,loading:false,error:'',busy:false,refreshed:'12:00',refresh:async()=>{},clearError:()=>{},run:async()=>false};
          createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/admin/agenda']},React.createElement(TestCatalog.Provider,{value:catalog},React.createElement(TestContext.Provider,{value},React.createElement(Routes,null,React.createElement(Route,{path:'/admin/*',element:React.createElement(AdminLayout)}))))));
        </script></body></html>`,
          );
          res.setHeader("Content-Type", "text/html");
          res.end(html);
        });
      },
    },
  ],
});
await server.listen();
console.log("QA preview: http://127.0.0.1:5188/__qa");
