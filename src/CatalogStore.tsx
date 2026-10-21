import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { type Profissional, type Servico } from "./data";
import { backend } from "./dataClient";

type Catalog = {
  business?: { name: string; phone: string | null; email: string | null; street: string | null; city: string | null; state: string | null } | null;
  services: Servico[];
  professionals: Profissional[];
  loading: boolean;
  error: string;
  updateService: (
    id: string,
    update: Partial<Servico>,
  ) => Promise<string | null>;
  addService: (update: Partial<Servico>) => Promise<string | null>;
  updateProfessional: (
    id: string,
    update: Partial<Profissional>,
  ) => Promise<string | null>;
  addProfessional: (
    professional: Partial<Profissional>,
  ) => Promise<string | null>;
  deleteService: (id: string) => Promise<string | null>;
  deleteProfessional: (id: string) => Promise<string | null>;
};
const CatalogContext = createContext<Catalog | null>(null);
const mapService = (
  row: Record<string, unknown>,
  commissions: Record<string, number>,
): Servico => ({
  id: String(row.id),
  nome: String(row.name),
  descricao: String(row.description ?? ""),
  preco: Number(row.price_cents) / 100,
  duracao: Number(row.duration_minutes),
  cor: String(row.color ?? "#203F20"),
  ativo: Boolean(row.active),
  comissoes: commissions,
  comissaoPadrao: Number(row.default_commission_percent ?? 50),
});
const mapProfessional = (row: Record<string, unknown>): Profissional => ({
  id: String(row.id),
  nome: String(row.name),
  iniciais: String(row.name)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase(),
  telefone: String(row.phone ?? ""),
  especialidades: String(row.specialties ?? ""),
  cor: "#203F20",
  ativo: Boolean(row.active),
  foto_url: typeof row.photo_url === "string" ? row.photo_url : null,
});
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Servico[]>([]);
  const [professionals, setProfessionals] = useState<Profissional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [business, setBusiness] = useState<Catalog['business']>(null);
  const load = useCallback(async () => {
    if (!backend) {
      setError("Conexão indisponível.");
      setLoading(false);
      return;
    }
    const result = await backend.rpc('catalog');
    if (result.error || !result.data) {
      setError("Não foi possível atualizar serviços e profissionais.");
      setLoading(false);
      return;
    }
    const commissionMap = new Map<string, Record<string, number>>();
    for (const link of result.data.links ?? []) {
      if (link.commission_percent == null) continue;
      const serviceId = String(link.service_id);
      commissionMap.set(serviceId, {
        ...(commissionMap.get(serviceId) ?? {}),
        [String(link.professional_id)]: Number(link.commission_percent ?? 0),
      });
    }
    setServices(
      (result.data.services ?? []).map((row: Record<string, unknown>) =>
        mapService(row, commissionMap.get(String(row.id)) ?? {}),
      ),
    );
    setProfessionals((result.data.professionals ?? []).map(mapProfessional));
    setBusiness(result.data.business ?? null);
    setError("");
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const auth = backend?.auth.onAuthStateChange(() => {
      window.setTimeout(() => void load(), 0);
    });
    const reload = () => void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
      auth?.data.subscription.unsubscribe();
    };
  }, [load]);
  const save = async (action: string, payload: Record<string, unknown>) => {
    if (!backend) return "Conexão indisponível.";
    try {
      const result =
        action === "delete_professional_record" || action === "delete_service_record"
          ? await backend.rpc(action, payload)
          : action === "save_professional_profile"
          ? await backend.rpc("save_professional_profile", { payload })
          : action === "save_service_profile"
            ? await backend.rpc("save_service_profile", { payload })
            : await backend.rpc("office_action", { action, payload });
      if (result.error) return result.error.message;
      await load();
      if (action.startsWith("delete_")) window.dispatchEvent(new Event("operations:changed"));
      return null;
    } catch {
      return "Não foi possível salvar. Confira sua conexão e tente novamente.";
    }
  };
  const updateService = (id: string, update: Partial<Servico>) => {
    const s = { ...services.find((s) => s.id === id), ...update };
    return save("save_service_profile", {
      id: id || null,
      name: s.nome,
      description: s.descricao,
      price: Math.round(Number(s.preco) * 100),
      duration: s.duracao,
      color: s.cor,
      active: s.ativo,
      commission: s.comissaoPadrao ?? 50,
      commissions: Object.entries(s.comissoes ?? {}).map(
        ([professional_id, commission_percent]) => ({
          professional_id,
          commission_percent,
        }),
      ),
    });
  };
  const updateProfessional = (id: string, update: Partial<Profissional>) => {
    const p = { ...professionals.find((p) => p.id === id), ...update };
    return save("save_professional_profile", {
      id: id || null,
      name: p.nome,
      phone: p.telefone,
      specialties: p.especialidades,
      photo_url: p.foto_url ?? null,
      active: p.ativo,
    });
  };
  return (
    <CatalogContext.Provider
      value={{
        services,
        business,
        professionals,
        loading,
        error,
        updateService,
        addService: (s) => updateService("", s),
        updateProfessional,
        addProfessional: (p) => updateProfessional("", { ...p, ativo: true }),
        deleteProfessional: (id) => save("delete_professional_record", { professional_id: id }),
        deleteService: (id) => save("delete_service_record", { service_id: id }),
      }}
    >
      {children}
    </CatalogContext.Provider>
  );
}
export function useCatalog() {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("CatalogProvider ausente");
  return value;
}
