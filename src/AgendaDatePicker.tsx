import { useState } from 'react'
import { Modal } from './ManagementPages'
import { dayKey } from './operations'

export function AgendaDatePicker({ date, choose, close }: { date: string; choose: (date: string) => void; close: () => void }) {
  const selected = new Date(`${date}T12:00:00`)
  const [month, setMonth] = useState(selected.getMonth())
  const [year, setYear] = useState(selected.getFullYear())
  const today = dayKey()
  const offset = new Date(year, month, 1, 12).getDay()
  const days = new Date(year, month + 1, 0, 12).getDate()
  const pick = (value: string) => { choose(value); close() }
  const shift = (amount: number) => { const next = new Date(year, month + amount, 1, 12); setMonth(next.getMonth()); setYear(next.getFullYear()) }
  return <Modal title="Escolher data" close={close}>
    <div className="agenda-calendar">
      <div className="calendar-selectors">
        <button className="outline" aria-label="Mês anterior" onClick={() => shift(-1)}>‹</button>
        <label className="field"><span>Mês</span><select aria-label="Mês" value={month} onChange={event => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Date(2024, index, 1).toLocaleDateString('pt-BR', { month: 'long' })}</option>)}</select></label>
        <label className="field"><span>Ano</span><select aria-label="Ano" value={year} onChange={event => setYear(Number(event.target.value))}>{Array.from({ length: 301 }, (_, index) => <option key={1900 + index} value={1900 + index}>{1900 + index}</option>)}</select></label>
        <button className="outline" aria-label="Próximo mês" onClick={() => shift(1)}>›</button>
      </div>
      <div className="calendar-days" aria-label="Calendário">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(label => <small key={label}>{label}</small>)}
        {Array.from({ length: offset }, (_, index) => <span key={`empty-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
          return <button key={value} className={value === date ? 'selected' : value === today ? 'today' : ''} aria-label={`Selecionar ${String(index + 1).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`} aria-pressed={value === date} onClick={() => pick(value)}>{index + 1}</button>
        })}
      </div>
      <button className="outline calendar-today" onClick={() => pick(today)}>Ir para hoje</button>
    </div>
  </Modal>
}
