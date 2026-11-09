import { useState } from 'react'
import type { AppState, Question, QuestionAnswer, TermInfo } from '../../../shared/types'
import { Modal } from '../lib/ui'

/** возраст вопроса: «5 мин», «2 ч», «3 д» */
function age(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (m < 60) return `${m} мин`
  if (m < 60 * 24) return `${Math.round(m / 60)} ч`
  return `${Math.round(m / 60 / 24)} д`
}

function QuestionRow({
  q,
  term,
  folderName,
  onOpenTerm
}: {
  q: Question
  term: TermInfo | undefined
  folderName: string
  onOpenTerm: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const answer = (a: QuestionAnswer): void => void window.api.answerQuestion(q.id, a)
  const sendText = (): void => {
    const t = text.trim()
    if (!t) return
    answer({ kind: 'text', text: t })
    setText('')
  }
  return (
    <div className={`q-row ${q.state === 'deferred' ? 'deferred' : ''}`}>
      <div className="q-head">
        <button className="q-term" onClick={onOpenTerm} title={term?.cwd}>
          {term?.name ?? 'терминал удалён'}
          <span className="muted small"> · {folderName}</span>
        </button>
        <span className="muted small">
          {q.state === 'deferred' ? 'отложен · ' : ''}
          {age(q.createdAt)}
        </span>
        <button
          className="icon-btn q-dismiss"
          title="Снять вопрос без ответа"
          onClick={() => window.api.dismissQuestion(q.id)}
        >
          ✕
        </button>
      </div>
      <button className="q-title" onClick={() => setOpen((v) => !v)} disabled={!q.detail}>
        {q.detail ? <span className="sb-chevron">{open ? '▾' : '▸'}</span> : <span className="sb-chevron" />}
        {q.title}
      </button>
      {open && q.detail && <pre className="q-detail">{q.detail}</pre>}
      <div className="q-actions">
        {q.source === 'tool' ? (
          q.options.map((o, i) => (
            <button
              key={i}
              className="btn small"
              title={o.description}
              onClick={() => answer({ kind: 'option', index: i })}
            >
              {i + 1}. {o.label}
            </button>
          ))
        ) : (
          <>
            {q.options.map((o, i) => (
              <button
                key={i}
                className="btn small"
                title={o.description}
                onClick={() => answer({ kind: 'option', index: i })}
              >
                {o.label}
              </button>
            ))}
            <button className="btn small" onClick={() => answer({ kind: 'yes' })}>
              Да
            </button>
            <button className="btn small" onClick={() => answer({ kind: 'no' })}>
              Нет
            </button>
            <button className="btn small" onClick={() => answer({ kind: 'defer' })}>
              Откладываем
            </button>
            <button className="btn small" onClick={() => answer({ kind: 'explain' })}>
              Поясни
            </button>
          </>
        )}
        <input
          className="q-input"
          placeholder="Свой ответ…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendText()
          }}
        />
        <button className="btn small primary" disabled={!text.trim()} onClick={sendText}>
          ➤
        </button>
      </div>
    </div>
  )
}

/** Окно «Вопросы»: открытые вопросы сессий, старые сверху, отложенные — в конце */
export function Questions({
  state,
  filterTermId,
  onClearFilter,
  onOpenTerm,
  onClose
}: {
  state: AppState
  /** показать вопросы только этого терминала (открыто из его шапки или сайдбара) */
  filterTermId: string | null
  onClearFilter: () => void
  onOpenTerm: (term: TermInfo) => void
  onClose: () => void
}): React.JSX.Element {
  const filterTerm = state.terminals.find((t) => t.id === filterTermId)
  const list = state.questions
    .filter((q) => !filterTerm || q.termId === filterTerm.id)
    .sort((a, b) => Number(a.state === 'deferred') - Number(b.state === 'deferred') || a.createdAt - b.createdAt)
  return (
    <Modal onClose={onClose} width="62%">
      <div className="modal-head">
        <h3>{filterTerm ? `Вопросы терминала «${filterTerm.name}»` : 'Вопросы сессий'}</h3>
        {filterTerm && (
          <button className="btn small" onClick={onClearFilter}>
            Показать все {state.questions.length}
          </button>
        )}
      </div>
      <div className="modal-body">
        {list.length === 0 && <div className="muted">Открытых вопросов нет</div>}
        {list.map((q) => {
          const term = state.terminals.find((t) => t.id === q.termId)
          const folder = state.folders.find((f) => f.id === term?.folderId)
          return (
            <QuestionRow
              key={q.id}
              q={q}
              term={term}
              folderName={folder ? `${folder.icon ? folder.icon + ' ' : ''}${folder.name}` : ''}
              onOpenTerm={() => term && onOpenTerm(term)}
            />
          )
        })}
      </div>
    </Modal>
  )
}
