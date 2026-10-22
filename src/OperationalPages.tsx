import { CommissionFields } from "./CommissionFields";
import { useState } from "react";
import { useCatalog } from "./CatalogStore";
import { type Servico, type Profissional } from "./data";
import { Page, Modal } from "./ManagementPages";
import { money } from "./operations";
import { uploadCatalogPhoto } from "./media";
import { CredentialModal, LoginFields, ProfessionalAccessPanel } from './professional/ProfessionalAccessPanel';

export function ServicesV2() {
  const { services, professionals, updateService, addService, deleteService } = useCatalog();
  const [draft, setDraft] = useState<Servico | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeProfessionals = professionals.filter(
    (professional) => professional.ativo,
  );
  const fresh = (): Servico => ({
    id: "",
    nome: "",
    descricao: "",
    preco: 0,
    duracao: 30,
    cor: "#203F20",
    ativo: true,
    comissaoPadrao: 50,
    modoComissao: 'professional',
    comissoes: {},
  });
  const edit = (service: Servico) => {
    setDraft({ ...service, comissoes: { ...service.comissoes } });
    setError("");
  };

  return (
    <Page
      title="Serviços"
      text="Preços, duração e comissão de cada profissional."
      action={
        <button
          className="primary"
          onClick={() => {
            setDraft(fresh());
            setError("");
          }}
        >
          Novo serviço
        </button>
      }
    >
      <section className="panel operation-panel">
        {services.map((service) => (
          <div className="record-row service-management-row" key={service.id}>
            <div>
              <strong>{service.nome}</strong>
              <p>
                {service.duracao} min · {money(service.preco * 100)} ·{" "}
                {service.ativo ? "Ativo" : "Pausado"}
              </p>
              <div className="service-commission-summary">
                {activeProfessionals.map((professional) => (
                  <span key={professional.id}>
                    {professional.nome}:{" "}
                    {service.modoComissao === 'professional' ? professional.comissaoServicos ?? 50 : service.modoComissao === 'uniform' ? service.comissaoPadrao ?? 50 : service.comissoes?.[professional.id] ?? service.comissaoPadrao ?? 50}%
                  </span>
                ))}
              </div>
            </div>
            <button
              className="outline small"
              aria-label={`Editar ${service.nome}`}
              onClick={() => edit(service)}
            >
              Editar
            </button>
          </div>
        ))}
        {!services.length && (
          <p className="empty">Nenhum serviço cadastrado.</p>
        )}
      </section>

      {draft && (
        <Modal
          title={draft.id ? "Editar serviço" : "Novo serviço"}
          close={() => setDraft(null)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const saveError = await (draft.id
                  ? updateService(draft.id, draft)
                  : addService(draft));
                if (saveError) setError(saveError);
                else setDraft(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>Nome</span>
              <input
                required
                minLength={2}
                value={draft.nome}
                onChange={(event) =>
                  setDraft({ ...draft, nome: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Descrição</span>
              <input
                value={draft.descricao}
                onChange={(event) =>
                  setDraft({ ...draft, descricao: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Preço (R$)</span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={draft.preco}
                onChange={(event) =>
                  setDraft({ ...draft, preco: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              <span>Duração (minutos)</span>
              <input
                required
                type="number"
                min="5"
                max="480"
                value={draft.duracao}
                onChange={(event) =>
                  setDraft({ ...draft, duracao: Number(event.target.value) })
                }
              />
            </label>
            <CommissionFields rate={draft.comissaoPadrao ?? 50} overrides={draft.comissoes ?? {}} mode={draft.modoComissao ?? 'custom'}
              onModeChange={mode => setDraft({ ...draft, modoComissao: mode })}
              onChange={(rate, overrides) => setDraft({ ...draft, comissaoPadrao: rate, comissoes: overrides })} />
            <label className="check">
              <input
                type="checkbox"
                checked={draft.ativo}
                onChange={(event) =>
                  setDraft({ ...draft, ativo: event.target.checked })
                }
              />
              Disponível para agendamento
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar serviço"}
            </button>
            {draft.id && <button className="danger-button" type="button" disabled={busy} onClick={async () => {
              if (!window.confirm("Excluir definitivamente este serviço e os atendimentos, pagamentos, comissões e pacotes vinculados? Esta ação não pode ser desfeita.")) return;
              setBusy(true);
              try {
                const failure = await deleteService(draft.id);
                if (failure) setError(failure); else setDraft(null);
              } finally { setBusy(false); }
            }}>Excluir serviço</button>}
          </form>
        </Modal>
      )}
    </Page>
  );
}

export function ProfessionalsV2() {
  const {
    professionals,
    updateProfessional,
    addProfessional,
    deleteProfessional,
    createdAccess,
    clearCreatedAccess,
  } = useCatalog();
  const [draft, setDraft] = useState<Profissional | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [login, setLogin] = useState({ email: '', password: '', confirm: '' });
  const fresh: Profissional = {
    id: "",
    nome: "",
    telefone: "",
    especialidades: "",
    iniciais: "",
    cor: "#203F20",
    ativo: true,
    comissaoServicos: 50,
    comissaoProdutos: 20,
  };
  const remove = async () => {
    if (
      !draft ||
      busy ||
      !window.confirm(
        "Excluir definitivamente este profissional e seus agendamentos, comandas, pagamentos e comissões? Esta ação não pode ser desfeita.",
      )
    )
      return;
    setBusy(true);
    try {
      const removeError = await deleteProfessional(draft.id);
      if (removeError) setError(removeError);
      else setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Profissionais"
      text="Dados pessoais e disponibilidade no agendamento."
      action={
        <button
          className="primary"
          onClick={() => {
            setDraft(fresh);
            setLogin({ email: '', password: '', confirm: '' });
            setCommissionOpen(false);
            setPhoto(null);
            setError("");
          }}
        >
          Novo profissional
        </button>
      }
    >
      <section className="panel operation-panel">
        {professionals.map((professional) => (
          <div className="record-row profile-row" key={professional.id}>
            <div className="catalog-identity">
              {professional.foto_url ? (
                <img
                  className="catalog-photo"
                  src={professional.foto_url}
                  alt=""
                />
              ) : (
                <div className="catalog-placeholder">
                  {professional.iniciais}
                </div>
              )}
              <div>
                <strong>{professional.nome}</strong>
                <p>{professional.ativo ? "Ativo no agendamento" : "Inativo"}</p>
              </div>
            </div>
            <button
              className="outline small"
              onClick={() => {
                setDraft({ ...professional });
                setCommissionOpen(false);
                setPhoto(null);
                setError("");
              }}
            >
              Editar
            </button>
          </div>
        ))}
        {!professionals.length && (
          <p className="empty">Nenhum profissional cadastrado.</p>
        )}
      </section>

      {draft && (
        <Modal
          title={draft.id ? "Editar profissional" : "Novo profissional"}
          close={() => setDraft(null)}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              if (!draft.id && login.password !== login.confirm) { setError('A confirmação da senha está diferente.'); return; }
              setBusy(true);
              setError("");
              try {
                let photoUrl = draft.foto_url ?? null;
                if (photo)
                  photoUrl = await uploadCatalogPhoto(photo, "professionals");
                const payload = { ...draft, foto_url: photoUrl, ...(!draft.id ? { acesso: { email: login.email.trim(), password: login.password } } : {}) };
                const saveError = await (draft.id
                  ? updateProfessional(draft.id, payload)
                  : addProfessional(payload));
                if (saveError) setError(saveError);
                else { setDraft(null); setLogin({ email: '', password: '', confirm: '' }); }
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Não foi possível enviar a foto.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>Foto (4:5)</span>
              <input
                accept="image/*"
                type="file"
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              />
            </label>
            {draft.foto_url && !photo && (
              <img
                className="photo-preview"
                src={draft.foto_url}
                alt={`Foto de ${draft.nome}`}
              />
            )}
            <label className="field">
              <span>Nome</span>
              <input
                required
                minLength={2}
                value={draft.nome}
                onChange={(event) =>
                  setDraft({ ...draft, nome: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Telefone</span>
              <input
                type="tel"
                value={draft.telefone}
                onChange={(event) =>
                  setDraft({ ...draft, telefone: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Especialidades</span>
              <input
                value={draft.especialidades}
                placeholder="Ex.: corte, barba, química"
                onChange={(event) =>
                  setDraft({ ...draft, especialidades: event.target.value })
                }
              />
            </label>
            <button type="button" className="outline" aria-expanded={commissionOpen} onClick={() => setCommissionOpen(!commissionOpen)}>Configurar comissões</button>
            {commissionOpen && <fieldset className="service-commission-fields"><legend>Comissões do profissional</legend>
              <p>Valem para os itens que usam o percentual do perfil. Itens com regra própria mantêm a configuração escolhida.</p>
              <label className="field"><span>Comissão em serviços (%)</span><input type="number" required min="0" max="100" step="0.01" value={draft.comissaoServicos ?? 50} onChange={event => setDraft({ ...draft, comissaoServicos: Number(event.target.value) })} /></label>
              <label className="field"><span>Comissão em produtos (%)</span><input type="number" required min="0" max="100" step="0.01" value={draft.comissaoProdutos ?? 20} onChange={event => setDraft({ ...draft, comissaoProdutos: Number(event.target.value) })} /></label>
            </fieldset>}
            <label className="check">
              <input
                type="checkbox"
                checked={draft.ativo}
                onChange={(event) =>
                  setDraft({ ...draft, ativo: event.target.checked })
                }
              />
              Ativo no agendamento
            </label>
            {draft.id ? <ProfessionalAccessPanel professionalId={draft.id} /> : <section className="professional-access-row"><strong>Login do profissional</strong><p>Defina o e-mail e a senha que este barbeiro usará para entrar.</p><LoginFields {...login} change={values => setLogin(previous => ({ ...previous, ...values }))} /></section>}
            {error && <p className="form-error">{error}</p>}
            <div className="row-actions">
              <button className="primary" disabled={busy}>
                {busy ? "Salvando…" : "Salvar profissional"}
              </button>
              {draft.id && draft.ativo && (
                <button
                  className="danger-button"
                  type="button"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Excluir profissional
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
      {createdAccess && !draft && <CredentialModal access={createdAccess} close={() => clearCreatedAccess?.()} />}
    </Page>
  );
}
