import { useEffect, useState } from 'react'
import type { TermInfo } from '../../../shared/types'
import { Modal } from '../lib/ui'

export function DiffModal({
  term,
  onClose
}: {
  term: TermInfo
  onClose: () => void
}): React.JSX.Element {
  const [diff, setDiff] = useState('Загрузка…')

  const load = (): void => {
    setDiff('Загрузка…')
    window.api.worktreeDiff(term.id).then(setDiff)
  }
  useEffect(load, [term.id])

  return (
    <Modal onClose={onClose} width="80%">
      <div className="modal-head">
        <h3>Diff · {term.worktree?.branch}</h3>
        <button className="btn" onClick={load}>
          Обновить
        </button>
      </div>
      <div className="modal-body">
        <pre className="diff-view">{diff}</pre>
      </div>
    </Modal>
  )
}
