import { useCatalog } from "./CatalogStore";

export function CommissionFields({ rate, overrides, mode = 'custom', onModeChange, onChange }: {
  rate: number;
  overrides: Record<string, number>;
  mode?: 'professional' | 'uniform' | 'custom';
  onModeChange?: (mode: 'professional' | 'uniform' | 'custom') => void;
  onChange: (rate: number, overrides: Record<string, number>) => void;
}) {
  const { professionals } = useCatalog();
  return <fieldset className="service-commission-fields">
    <legend>Comissão deste item</legend>
    <label className="field"><span>Como calcular a comissão?</span>
      <select aria-label="Como calcular a comissão?" value={mode} onChange={event => onModeChange?.(event.target.value as typeof mode)}>
        <option value="professional">Usar o percentual do perfil de cada barbeiro</option>
        <option value="uniform">Mesmo percentual para todos</option>
        <option value="custom">Personalizar por profissional</option>
      </select>
    </label>
    {mode === 'professional' ? <p>Usa a comissão de serviços ou produtos configurada no perfil do profissional.</p> : <><label className="field"><span>Percentual padrão (%)</span>
      <input type="number" inputMode="decimal" required min="0" max="100" step="0.01" value={rate}
        onChange={event => onChange(Number(event.target.value), overrides)} />
    </label>
    {mode === 'custom' && <p>Preencha apenas os profissionais que recebem outro percentual. Em branco, usa o padrão deste item. Zero significa sem comissão.</p>}
    {mode === 'custom' && professionals.filter(professional => professional.ativo || overrides[professional.id] != null).map(professional => <label className="field" key={professional.id}>
      <span>{professional.nome} (%)</span>
      <input type="number" inputMode="decimal" min="0" max="100" step="0.01" placeholder={`Padrão: ${rate}%`}
        value={overrides[professional.id] ?? ""}
        onChange={event => {
          const next = { ...overrides };
          if (event.target.value === "") delete next[professional.id];
          else next[professional.id] = Number(event.target.value);
          onChange(rate, next);
        }} />
    </label>)}</>}
  </fieldset>;
}
