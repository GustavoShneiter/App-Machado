/* global console */
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
        vite.middlewares.use("/__qa", async (_req, res) => {
          const fixture = await readFile(
            new URL("./operations-fixture.mjs", import.meta.url),
            "utf8",
          );
          const html = await vite.transformIndexHtml(
            "/__qa",
            `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module">
          import React from 'react';
          import {createRoot} from 'react-dom/client';
          import {MemoryRouter,Route,Routes} from 'react-router-dom';
          import {AdminLayout} from '/src/App.tsx';
          import {TestContext} from '/src/OperationsStore.tsx';
          import {TestCatalog} from '/src/CatalogStore.tsx';
          import '/src/styles.css';
          ${fixture.replace("export const fixture", "const fixture")}
          const catalog={services:[{id:'s1',nome:'Corte integrado',descricao:'Corte',preco:40,duracao:30,ativo:true,cor:'#203F20',comissoes:{p1:40,p2:0}}],professionals:[{id:'p1',nome:'Araújo',ativo:true,cor:'#203F20',iniciais:'A',especialidades:'Cortes',telefone:''},{id:'p2',nome:'Machado',ativo:true,cor:'#203F20',iniciais:'M',especialidades:'Cortes',telefone:''}],loading:false,error:'',updateService:async()=>null,addService:async()=>null,updateProfessional:async()=>null,addProfessional:async()=>null,deleteProfessional:async()=>null};
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
