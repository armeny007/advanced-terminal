import { useEffect, useState } from 'react'
import type { UsageStats } from '../../../shared/types'
import { useDismiss } from '../lib/ui'

function fmt(n: number): string {
  return n.toLocaleString('ru-RU')
}
function money(n: number): string {
  return '$' + n.toFixed(n < 1 ? 4 : 2)
}

export function UsagePopover({
  projectPath,
  sessionId,
  onClose
}: {
  projectPath: string
  sessionId: string | null
  onClose: () => void
}): React.JSX.Element {
  const [data, setData] = useState<UsageStats | null | 'loading'>('loading')
  const ref = useDismiss(onClose, true)

  useEffect(() => {
    if (!sessionId) {
      setData(null)
      return
    }
    window.api.getUsage(projectPath, sessionId).then(setData)
  }, [projectPath, sessionId])

  return (
    <div className="popover usage-pop" ref={ref}>
      <div className="popover-title">Расход токенов</div>
      {sessionId === null || data === null ? (
        <div className="muted small">Нет данных о сессии</div>
      ) : data === 'loading' ? (
        <div className="muted small">Загрузка…</div>
      ) : (
        <table className="usage-table">
          <thead>
            <tr>
              <th>Модель</th>
              <th>Вход</th>
              <th>Выход</th>
              <th>Кэш</th>
              <th>$</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.byModel).map(([model, u]) => (
              <tr key={model}>
                <td className="model-cell">{model}</td>
                <td>{fmt(u.inputTokens)}</td>
                <td>{fmt(u.outputTokens)}</td>
                <td>{fmt(u.cacheCreationTokens + u.cacheReadTokens)}</td>
                <td>
                  {u.costIsEstimate ? '≈' : ''}
                  {money(u.costUsd)}
                </td>
              </tr>
            ))}
            <tr className="total-row">
              <td>Итого</td>
              <td>{fmt(data.inputTokens)}</td>
              <td>{fmt(data.outputTokens)}</td>
              <td>{fmt(data.cacheCreationTokens + data.cacheReadTokens)}</td>
              <td>
                {data.costIsEstimate ? '≈' : ''}
                {money(data.costUsd)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
