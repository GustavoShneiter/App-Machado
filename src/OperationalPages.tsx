import { useState } from "react";
import { useCatalog } from "./CatalogStore";
import { type Servico, type Profissional } from "./data";
import { Page, Modal } from "./ManagementPages";
import { money } from "./operations";
import { uploadCatalogPhoto } from "./media";

export function ServicesV2() {
  const { services, updateService, addService } = useCatalog();
  const [draft, setDraft] = useState<Servico | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fresh: Servico = { id: "", nome: "", descricao: "", preco: 0, duracao: 30, cor: "#203F20", ativo: true, comissaoPadrao: 50 };
  return (
    <Page title="Serviços" text="Preços, duração e comissão padrão." action={<button className="primary" onClick={() => { setDraft(fresh); setError(""); }}>Novo serviço</button>}>
      <section className="panel operation-panel">
        {services.map((service) => <div className="record-row service-management-row" key={service.id}>
          <div><strong>{service.nome}</strong><p>{service.duracao} min · {money(service.preco * 100)} · {service.ativo ? "Ativo" : "Pausado"}</p><div className="service-commission-summary">Comissão padrão: {service.comissaoPadrao}%</div></div>
          <button className="outline small" aria-label={`Editar ${service.nome}`} onClick={() => { setDraft({ ...service }); setError(""); }}>Editar</button>
        </div>)}
        {!services.length && <p className="empty">Nenhum serviço cadastrado.</p>}
      </section>
      {draft && <Modal title={draft.id ? "Editar serviço" : "Novo serviço"} close={() => setDraft(null)}>
        <form onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { const saveError = await (draft.id ? updateService(draft.id, draft) : addService(draft)); if (saveError) setError(saveError); else setDraft(null); } finally { setBusy(false); } }}>
          <label className="field"><span>Nome</span><input required minLength={2} value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label>
          <label className="field"><span>Descrição</span><input value={draft.descricao} onChange={(event) => setDraft({ ...draft, descricao: event.target.value })} /></label>
          <label className="field"><span>Preço (R$)</span><input required type="number" min="0" step="0.01" value={draft.preco} onChange={(event) => setDraft({ ...draft, preco: Number(event.target.value) })} /></label>
          <label className="field"><span>Duração (minutos)</span><input required type="number" min="5" max="480" value={draft.duracao} onChange={(event) => setDraft({ ...draft, duracao: Number(event.target.value) })} /></label>
          <label className="field"><span>Comissão padrão do serviço (%)</span><input required type="number" min="0" max="100" step="0.01" value={draft.comissaoPadrao} onChange={(event) => setDraft({ ...draft, comissaoPadrao: Number(event.target.value) })} /></label>
          <label className="check"><input type="checkbox" checked={draft.ativo} onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })} />Disponível para agendamento</label>
          {error && <p className="form-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar serviço"}</button>
        </form>
      </Modal>}
    </Page>
  );
}

export function ProfessionalsV2() {
  const { professionals, updateProfessional, addProfessional, deleteProfessional } = useCatalog();
  const [draft, setDraft] = useState<Profissional | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fresh: Profissional = { id: "", nome: "", telefone: "", especialidades: "", iniciais: "", cor: "#203F20", ativo: true, comissaoServico: null, comissaoProduto: null };
  const remove = async () => {
    if (!draft || busy || !window.confirm(`Apagar ${draft.nome} permanentemente? Agendamentos, comandas, pagamentos, repasses e bloqueios associados também serão apagados.`)) return;
    setBusy(true);
    try { const removeError = await deleteProfessional(draft.id); if (removeError) setError(removeError); else setDraft(null); }
    finally { setBusy(false); }
  };
  return (
    <Page title="Profissionais" text="Equipe, comissões personalizadas e disponibilidade." action={<button className="primary" onClick={() => { setDraft(fresh); setPhoto(null); setError(""); }}>Novo profissional</button>}>
      <section className="panel operation-panel">
        {professionals.map((professional) => <div className="record-row profile-row" key={professional.id}>
          <div className="catalog-identity">{professional.foto_url ? <img className="catalog-photo" src={professional.foto_url} alt="" /> : <div className="catalog-placeholder">{professional.iniciais}</div>}<div><strong>{professional.nome}</strong><p>{professional.ativo ? "Ativo no agendamento" : "Inativo"}</p></div></div>
          <button className="outline small" onClick={() => { setDraft({ ...professional }); setPhoto(null); setError(""); }}>Editar</button>
        </div>)}
        {!professionals.length && <p className="empty">Nenhum profissional cadastrado.</p>}
      </section>
      {draft && <Modal title={draft.id ? "Editar profissional" : "Novo profissional"} close={() => setDraft(null)}>
        <form onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); try { let photoUrl = draft.foto_url ?? null; if (photo) photoUrl = await uploadCatalogPhoto(photo, "professionals"); const saveError = await (draft.id ? updateProfessional(draft.id, { ...draft, foto_url: photoUrl }) : addProfessional({ ...draft, foto_url: photoUrl })); if (saveError) setError(saveError); else setDraft(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível enviar a foto."); } finally { setBusy(false); } }}>
          <label className="field"><span>Foto (4:5)</span><input accept="image/*" type="file" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label>
          {draft.foto_url && !photo && <img className="photo-preview" src={draft.foto_url} alt={`Foto de ${draft.nome}`} />}
          <label className="field"><span>Nome</span><input required minLength={2} value={draft.nome} onChange={(event) => setDraft({ ...draft, nome: event.target.value })} /></label>
          <label className="field"><span>Telefone</span><input type="tel" value={draft.telefone} onChange={(event) => setDraft({ ...draft, telefone: event.target.value })} /></label>
          <label className="field"><span>Especialidades</span><input value={draft.especialidades} placeholder="Ex.: corte, barba, química" onChange={(event) => setDraft({ ...draft, especialidades: event.target.value })} /></label>
          <fieldset className="service-commission-fields"><legend>Comissão personalizada</legend><p>Em branco, o profissional usa a comissão padrão dos serviços e produtos.</p>
            <label className="field"><span>Todos os serviços (%)</span><div className="percent-input"><input type="number" min="0" max="100" step="0.01" placeholder="Padrão do serviço" value={draft.comissaoServico ?? ""} onChange={(event) => setDraft({ ...draft, comissaoServico: event.target.value === "" ? null : Number(event.target.value) })} /><b>%</b></div></label>
            <label className="field"><span>Todos os produtos (%)</span><div className="percent-input"><input type="number" min="0" max="100" step="0.01" placeholder="Padrão do produto" value={draft.comissaoProduto ?? ""} onChange={(event) => setDraft({ ...draft, comissaoProduto: event.target.value === "" ? null : Number(event.target.value) })} /><b>%</b></div></label>
          </fieldset>
          <label className="check"><input type="checkbox" checked={draft.ativo} onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })} />Ativo no agendamento</label>
          {error && <p className="form-error">{error}</p>}
          <div className="row-actions"><button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar profissional"}</button>{draft.id && <button className="danger-button" type="button" disabled={busy} onClick={() => void remove()}>Excluir profissional</button>}</div>
        </form>
      </Modal>}
    </Page>
  );
}
