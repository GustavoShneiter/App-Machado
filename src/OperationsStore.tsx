import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { backend } from "./dataClient";
import { emptyOperations, type Operations } from "./operations";

type Store = {
  data: Operations;
  loading: boolean;
  error: string;
  busy: boolean;
  refreshed: string;
  refresh: () => Promise<void>;
  clearError: () => void;
  run: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
};
const Context = createContext<Store | null>(null);
export function OperationsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Operations>(emptyOperations);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshed, setRefreshed] = useState("");
  const request = useRef(0);
  const saving = useRef(false);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    if (!backend) {
      setLoadError("Conexão com o sistema indisponível.");
      setLoading(false);
      return;
    }
    try {
      const result = await backend.rpc("office_snapshot");
      if (result.error) throw result.error;
      const normalized = result.data
        ? {
            ...result.data,
            blocks: Array.isArray(result.data.blocks) ? result.data.blocks : [],
            packageRedemptions: Array.isArray(result.data.packageRedemptions)
              ? result.data.packageRedemptions
              : [],
          }
        : null;
      if (
        !normalized ||
        !Object.keys(emptyOperations).every((k) => Array.isArray(normalized[k]))
      )
        throw new Error("Resposta inválida ao atualizar dados.");
      if (alive.current && version === request.current) {
        setData(normalized as Operations);
        setRefreshed(new Date().toLocaleTimeString("pt-BR"));
        setLoading(false);
        setLoadError("");
      }
    } catch (e) {
      if (alive.current && version === request.current) {
        setLoading(false);
        setLoadError(
          e instanceof Error
            ? e.message
            : "Não foi possível atualizar os dados. Tente novamente.",
        );
      }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10000);
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      alive.current = false;
      request.current++;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
    };
  }, [refresh]);
  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    if (saving.current || !backend) return false;
    if (!navigator.onLine) { setError('Sem internet. Reconecte antes de salvar.'); return false; }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result =
        action === "remove_agenda_appointment"
          ? await backend.rpc("remove_agenda_appointment", { appointment_id: String(payload.id ?? '') })
          : action === "reset_operational_data"
          ? await backend.rpc("reset_operational_data", {
              confirmation: String(payload.confirmation ?? ""),
            })
          : action === "save_product_profile"
            ? await backend.rpc("save_product_profile", { payload })
            : action === "add_command_product"
              ? await backend.rpc("add_product_to_command", {
                  command_id: String(payload.command_id ?? ""),
                  product_id: String(payload.product_id ?? ""),
                  item_quantity: Number(payload.quantity ?? 1),
                })
              : action === "open_manual_command"
                ? await backend.rpc("open_manual_command", {
                    customer_name: String(payload.name ?? ""),
                    customer_phone: String(payload.phone ?? ""),
                  })
                : action === "add_command_service"
                  ? await backend.rpc("add_service_to_command", {
                      command_id: String(payload.command_id ?? ""),
                      service_id: String(payload.service_id ?? ""),
                      professional_id: String(payload.professional_id ?? ""),
                    })
                  : action === "remove_command_item"
                    ? await backend.rpc("remove_command_item", {
                        command_item_id: String(payload.id ?? ""),
                      })
                    : action === "mark_command_ready"
                      ? await backend.rpc("mark_command_ready", {
                          command_id: String(payload.command_id ?? ""),
                        })
                      : action === "set_command_adjustments"
                        ? await backend.rpc("set_command_adjustments", {
                            command_id: String(payload.command_id ?? ""),
                            discount_cents: Number(payload.discount ?? 0),
                            surcharge_cents: Number(payload.surcharge ?? 0),
                          })
                        : action === "save_customer"
                          ? await backend.rpc("save_customer_profile", {
                              payload,
                            })
                          : action === "save_package"
                            ? await backend.rpc("save_service_package", {
                                payload,
                              })
                            : action === "sell_package"
                              ? await backend.rpc("sell_service_package", {
                                  package_id: String(payload.package_id ?? ""),
                                  customer_id: String(
                                    payload.customer_id ?? "",
                                  ),
                                  payment_method: String(payload.method ?? ""),
                                })
                              : action === "redeem_package"
                                ? await backend.rpc("redeem_package_service", {
                                    package_sale_id: String(
                                      payload.sale_id ?? "",
                                    ),
                                    service_id: String(
                                      payload.service_id ?? "",
                                    ),
                                  })
                                : action === "save_business"
                                  ? await backend.rpc(
                                      "save_business_settings",
                                      { payload },
                                    )
                                  : action === "delete_customer"
                                    ? await backend.rpc(
                                        "delete_customer_record",
                                        {
                                          customer_id: String(payload.id ?? ""),
                                        },
                                      )
                                    : action === "create_schedule_block"
                                      ? await backend.rpc(
                                          "create_schedule_block",
                                          {
                                            professional_id: String(
                                              payload.professional_id ?? "",
                                            ),
                                            starts_at: String(
                                              payload.starts_at ?? "",
                                            ),
                                            ends_at: String(
                                              payload.ends_at ?? "",
                                            ),
                                            reason: String(
                                              payload.reason ?? "",
                                            ),
                                          },
                                        )
                                      : action === "delete_schedule_block"
                                        ? await backend.rpc(
                                            "delete_schedule_block",
                                            {
                                              block_id: String(
                                                payload.id ?? "",
                                              ),
                                            },
                                          )
                                        : action === "delete_product"
                                          ? await backend.rpc(
                                              "delete_product_record",
                                              {
                                                product_id: String(
                                                  payload.id ?? "",
                                                ),
                                              },
                                            )
                                          : action === "close_package_command"
                                            ? await backend.rpc(
                                                "close_package_command",
                                                {
                                                  command_id: String(
                                                    payload.id ?? "",
                                                  ),
                                                },
                                              )
                                            : action === "delete_command"
                                              ? await backend.rpc(
                                                  "delete_command_record",
                                                  {
                                                    command_id: String(
                                                      payload.id ?? "",
                                                    ),
                                                  },
                                                )
                                              : await backend.rpc(
                                                  "office_action",
                                                  { action, payload },
                                                );
      if (result.error) throw result.error;
      await refresh();
      return true;
    } catch (e) {
      const rawMessage =
        typeof e === "object" && e && "message" in e
          ? String(e.message)
          : "Não foi possível salvar. Tente novamente.";
      const message =
        /atendimento nesse horário|slot_not_available|slot_blocked|exclusion|horário bloqueado/i.test(
          rawMessage,
        )
          ? "Esse profissional já possui um atendimento ou bloqueio nesse horário. Escolha outro horário disponível."
          : rawMessage;
      setError(message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const clearError = useCallback(() => {
    setError("");
    setLoadError("");
  }, []);
  return (
    <Context.Provider
      value={{
        data,
        loading,
        error: error || loadError,
        busy,
        refreshed,
        refresh,
        clearError,
        run,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useOperations() {
  const value = useContext(Context);
  if (!value) throw new Error("OperationsProvider ausente");
  return value;
}
