import { useCatalog } from "./CatalogStore";

export function CommissionFields({ rate, overrides, onChange }: {
  rate: number;
  overrides: Record<string, number>;
  onChange: (rate: number, overrides: Record<string, number>) => void;
}) {
  const { professionals } = useCatalog();
  return <fieldset className="service-commission-fields">
    <legend>Comissão deste item</legend>
    <label className="field"><span>Percentual padrão (%)</span>
      <input type="number" inputMode="decimal" required min="0" max="100" step="0.01" value={rate}
        onChange={event => onChange(Number(event.target.value), overrides)} />
    </label>
    <p>Defina a comissão deste serviço ou produto. Para um profissional receber outro percentual, preencha abaixo. Em branco, vale o padrão. Zero significa sem comissão.</p>
    {professionals.filter(professional => professional.ativo || overrides[professional.id] != null).map(professional => <label className="field" key={professional.id}>
      <span>{professional.nome} (%)</span>
      <input type="number" inputMode="decimal" min="0" max="100" step="0.01" placeholder={`Padrão: ${rate}%`}
        value={overrides[professional.id] ?? ""}
        onChange={event => {
          const next = { ...overrides };
          if (event.target.value === "") delete next[professional.id];
          else next[professional.id] = Number(event.target.value);
          onChange(rate, next);
        }} />
    </label>)}
  </fieldset>;
}
