// Токен Telegram-бота: зашифрованное хранение (см. secretStore). Имя файла сохранено
// от прежней реализации (telegram.token.enc/.txt), чтобы не потерять уже сохранённый токен.
import { createSecretStore } from '../secretStore'

const store = createSecretStore('telegram.token')

export const saveToken = (token: string): void => store.save(token)
export const loadToken = (): string | null => store.load()
export const clearToken = (): void => store.clear()
export const hasToken = (): boolean => store.has()
