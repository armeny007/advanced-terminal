import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { MobileRuntimeState } from '../../../shared/types'
import { Modal } from '../lib/ui'

export function MobileSettings({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [rt, setRt] = useState<MobileRuntimeState | null>(null)
  const [relay, setRelay] = useState('')
  const [pairing, setPairing] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    window.api.getMobileRuntime().then((s) => {
      setRt(s)
      setRelay(s.relayUrl)
    })
    window.api.getMobilePairing().then(setPairing)
    return window.api.onMobileRuntime(setRt)
  }, [])

  useEffect(() => {
    if (!pairing) return void setQr(null)
    QRCode.toDataURL(pairing, {
      width: 220,
      margin: 1,
      color: { dark: '#cdd6f4', light: '#1e1e2e' }
    }).then(setQr, () => setQr(null))
  }, [pairing])

  const patch = async (p: Parameters<typeof window.api.patchMobileSettings>[0]): Promise<void> => {
    setRt(await window.api.patchMobileSettings(p))
  }
  const saveRelay = async (): Promise<void> => {
    await patch({ relayUrl: relay.trim() })
    setPairing(await window.api.getMobilePairing()) // код содержит адрес релея
  }
  const genPairing = async (): Promise<void> => {
    if (pairing && !window.confirm('Создать новый код? Уже подключённые телефоны отвяжутся.')) return
    setPairing(await window.api.generateMobilePairing())
  }

  const statusText = !rt
    ? '…'
    : !rt.enabled
      ? 'выключено'
      : rt.error
        ? `ошибка: ${rt.error}`
        : rt.connected
          ? rt.clients > 0
            ? `подключено · телефонов: ${rt.clients}`
            : 'подключено к релею, телефон не в сети'
          : 'подключение к релею…'

  return (
    <Modal onClose={onClose} width="480px">
      <div className="modal-head">
        <h3>Мобильное приложение</h3>
      </div>
      <div className="modal-body form">
        <p className="tg-hint">
          Управление терминалами с iPhone через релей. Содержимое шифруется на концах — релей видит
          только зашифрованные кадры. Отсканируйте QR в мобильном приложении (mobile/).
        </p>

        <div className="tg-status">
          Статус: <b>{statusText}</b>
        </div>

        <label>
          Адрес релея
          <input value={relay} placeholder="ws://host:8787" onChange={(e) => setRelay(e.target.value)} />
        </label>
        <div className="form-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
          <button className="btn primary" disabled={!rt || relay.trim() === rt.relayUrl} onClick={saveRelay}>
            Сохранить адрес
          </button>
        </div>

        <label className="flag-row" style={{ marginTop: 4 }}>
          <input
            type="checkbox"
            checked={rt?.enabled ?? false}
            disabled={!rt}
            onChange={(e) => void patch({ enabled: e.target.checked })}
          />
          <span>Включить связь с телефоном</span>
        </label>

        <div className="tg-section">
          <div className="tg-section-title">Сопряжение</div>
          <button className="btn" onClick={genPairing}>
            {pairing ? 'Новый код сопряжения' : 'Создать код сопряжения'}
          </button>
          {qr && (
            <div className="mobile-qr">
              <img src={qr} alt="QR сопряжения" width={220} height={220} />
              <div className="tg-pairing">
                Или вставьте код вручную:
                <code className="flag-code mobile-pair-code">{pairing}</code>
                <button className="btn small" onClick={() => pairing && navigator.clipboard.writeText(pairing)}>
                  Скопировать
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
