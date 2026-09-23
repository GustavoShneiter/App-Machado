export type StatusAgendamento =
  | "Agendado"
  | "Confirmado"
  | "Cliente chegou"
  | "Em atendimento"
  | "Concluído"
  | "Cancelado"
  | "Não compareceu";

export type Servico = {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  duracao: number;
  cor: string;
  ativo: boolean;
  comissoes?: Record<string, number>;
};
export type Profissional = {
  id: string;
  nome: string;
  iniciais: string;
  telefone: string;
  especialidades: string;
  cor: string;
  ativo: boolean;
  foto_url?: string | null;
};
export type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  visitas: number;
  total: number;
  ultimoAtendimento: string;
};
export type Agendamento = {
  id: string;
  cliente: string;
  telefone: string;
  profissionalId: string;
  servicoId: string;
  data: string;
  horario: string;
  duracao: number;
  preco: number;
  status: StatusAgendamento;
  origem: string;
  observacoes?: string;
};

export const servicos: Servico[] = [
  {
    id: "corte",
    nome: "Corte de cabelo",
    descricao: "Corte tradicional com acabamento",
    preco: 30,
    duracao: 40,
    cor: "#3e8f75",
    ativo: true,
  },
  {
    id: "barba",
    nome: "Barba",
    descricao: "Barba completa com toalha quente",
    preco: 25,
    duracao: 30,
    cor: "#b68a4d",
    ativo: true,
  },
  {
    id: "corte-barba",
    nome: "Corte e barba",
    descricao: "Experiência completa",
    preco: 50,
    duracao: 70,
    cor: "#617fcb",
    ativo: true,
  },
];

export const profissionais: Profissional[] = [
  {
    id: "machado",
    nome: "Machado",
    iniciais: "M",
    telefone: "(11) 98888-1001",
    especialidades: "Cortes e barba",
    cor: "#1f6e58",
    ativo: true,
  },
  {
    id: "gustavo",
    nome: "Gustavo Araújo",
    iniciais: "GA",
    telefone: "(11) 98888-1002",
    especialidades: "Cortes modernos",
    cor: "#476bbb",
    ativo: true,
  },
];

export const clientes: Cliente[] = [
  {
    id: "c1",
    nome: "Rafael Lima",
    telefone: "(11) 98844-2277",
    visitas: 12,
    total: 670,
    ultimoAtendimento: "16/09/2026",
  },
  {
    id: "c2",
    nome: "Bruno Martins",
    telefone: "(11) 97788-3901",
    visitas: 8,
    total: 380,
    ultimoAtendimento: "15/09/2026",
  },
  {
    id: "c3",
    nome: "Lucas Pereira",
    telefone: "(11) 99200-1122",
    visitas: 5,
    total: 225,
    ultimoAtendimento: "14/09/2026",
  },
  {
    id: "c4",
    nome: "Thiago Costa",
    telefone: "(11) 96675-9811",
    visitas: 3,
    total: 150,
    ultimoAtendimento: "12/09/2026",
  },
];

export const agendamentosIniciais: Agendamento[] = [
  {
    id: "a1",
    cliente: "Rafael Lima",
    telefone: "(11) 98844-2277",
    profissionalId: "machado",
    servicoId: "corte-barba",
    data: "2026-09-17",
    horario: "09:00",
    duracao: 70,
    preco: 50,
    status: "Confirmado",
    origem: "Painel",
  },
  {
    id: "a2",
    cliente: "Bruno Martins",
    telefone: "(11) 97788-3901",
    profissionalId: "gustavo",
    servicoId: "corte",
    data: "2026-09-17",
    horario: "10:00",
    duracao: 40,
    preco: 30,
    status: "Agendado",
    origem: "Instagram",
  },
  {
    id: "a3",
    cliente: "Lucas Pereira",
    telefone: "(11) 99200-1122",
    profissionalId: "machado",
    servicoId: "barba",
    data: "2026-09-17",
    horario: "11:30",
    duracao: 30,
    preco: 25,
    status: "Cliente chegou",
    origem: "Painel",
  },
  {
    id: "a4",
    cliente: "Marcos Silva",
    telefone: "(11) 95522-7733",
    profissionalId: "gustavo",
    servicoId: "corte-barba",
    data: "2026-09-17",
    horario: "14:00",
    duracao: 70,
    preco: 50,
    status: "Agendado",
    origem: "Instagram",
  },
];

export const produtos = [
  {
    nome: "Pomada modeladora Machado",
    categoria: "Finalização",
    estoque: 4,
    minimo: 5,
    venda: 35,
  },
  {
    nome: "Shampoo antirresíduos",
    categoria: "Higiene",
    estoque: 12,
    minimo: 4,
    venda: 42,
  },
  {
    nome: "Óleo para barba",
    categoria: "Barba",
    estoque: 3,
    minimo: 5,
    venda: 38,
  },
  {
    nome: "Navalha profissional",
    categoria: "Ferramentas",
    estoque: 9,
    minimo: 3,
    venda: 16,
  },
];

export const horarioSlots = [
  "09:00",
  "09:40",
  "10:20",
  "11:00",
  "11:40",
  "13:00",
  "13:40",
  "14:20",
  "15:00",
  "15:40",
  "16:20",
  "17:00",
  "17:40",
];
