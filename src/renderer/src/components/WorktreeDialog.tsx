import { useEffect, useState } from 'react'
import { Modal } from '../lib/ui'

export function WorktreeDialog({
  defaultProjectPath,
  activeFolderId,
  onClose
}: {
  defaultProjectPath: string
  activeFolderId: string
  onClose: () => void
}): React.JSX.Element {
  const [projectPath, setProjectPath] = useState(defaultProjectPath)
  const [branch, setBranch] = useState('')
  const [name, setName] = useState('')
  const [setupScript, setSetupScript] = useState('')
  const [busyState, setBusyState] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.getProjectConfig(projectPath).then((c) => setSetupScript(c.setupScript))
  }, [projectPath])

  const create = async (): Promise<void> => {
    if (!projectPath.trim() || !branch.trim()) {
      setError('Укажите путь к репозиторию и имя ветки')
      return
    }
    setBusyState(true)
    setError('')
    try {
      await window.api.setProjectConfig({ projectPath, setupScript })
      await window.api.createWorktreeTerminal({
        folderId: activeFolderId,
        projectPath,
        branch: branch.trim(),
        name: name.trim() || undefined
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusyState(false)
    }
  }

  return (
    <Modal onClose={onClose} width="520px">
      <div className="modal-head">
        <h3>Терминал в git worktree</h3>
      </div>
      <div className="modal-body form">
        <label>
          Путь к репозиторию
          <input value={projectPath} onChange={(e) => setProjectPath(e.target.value)} />
        </label>
        <label>
          Имя ветки
          <input
            value={branch}
            placeholder="feature/xyz"
            onChange={(e) => setBranch(e.target.value)}
          />
        </label>
        <label>
          Имя терминала (необязательно)
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Setup-скрипт (выполнится в новом worktree)
          <textarea
            rows={4}
            value={setupScript}
            placeholder="npm install"
            onChange={(e) => setSetupScript(e.target.value)}
          />
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busyState} onClick={create}>
            {busyState ? 'Создание…' : 'Создать'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
