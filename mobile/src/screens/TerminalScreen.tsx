import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MobileKey, ScreenSeg } from '../../../src/shared/mobile-protocol'
import { send, subscribe } from '../link'
import { useStore } from '../store'
import { C, STATUS_COLOR, STATUS_LABEL } from '../theme'
import type { Routes } from '../routes'

const KEYS: { label: string; key: MobileKey }[] = [
  { label: '✅ Enter', key: 'enter' },
  { label: '❌ Esc', key: 'esc' },
  { label: '↑', key: 'up' },
  { label: '↓', key: 'down' },
  { label: '←', key: 'left' },
  { label: '→', key: 'right' },
  { label: '⇧Tab', key: 'shift-tab' },
  { label: '^C', key: 'ctrl-c' }
]

/** строки экрана со стилями — вложенные Text (выделенный пункт меню Claude виден только цветом).
 *  memo: история над экраном меняется редко, а экран — каждые 250 мс */
const StyledScreen = memo(function StyledScreen({ lines }: { lines: ScreenSeg[][] }): React.JSX.Element {
  return (
    <>
      {lines.map((line, y) => (
        <Text key={y}>
          {line.map((g, x) => {
            // dim — полупрозрачный цвет: opacity во вложенном Text не работает
            const fg = (g.fg ?? C.text) + (g.d ? '99' : '')
            return (
              <Text
                key={x}
                style={{
                  color: g.i ? (g.bg ?? C.surface2) : fg,
                  backgroundColor: g.i ? fg : g.bg,
                  fontWeight: g.b ? '700' : undefined
                }}
              >
                {g.s}
              </Text>
            )
          })}
          {y < lines.length - 1 ? '\n' : ''}
        </Text>
      ))}
    </>
  )
})

export function TerminalScreen({ route, navigation }: NativeStackScreenProps<Routes, 'Terminal'>): React.JSX.Element {
  const { termId } = route.params
  const term = useStore((s) => s.terminals.find((t) => t.id === termId))
  const screen = useStore((s) => s.screens[termId] ?? '')
  const lines = useStore((s) => s.screenLines[termId])
  const history = useStore((s) => s.screenHistory[termId])
  const hostOnline = useStore((s) => s.hostOnline)
  const [text, setText] = useState('')
  const [fontSize, setFontSize] = useState(11)
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null)
  // следуем за выводом только пока пользователь у нижнего края — иначе снимки (каждые 250 мс,
  // пока крутится спиннер) сбрасывали бы прокрутку вниз и наверх было не уйти
  const atBottom = useRef(true)

  // подписка на экран — пока открыт этот терминал
  useEffect(() => {
    subscribe(termId)
    return () => subscribe(null)
  }, [termId])

  useEffect(() => {
    if (atBottom.current) scroll.current?.scrollToEnd({ animated: false })
  }, [screen, lines])

  const menu = (): void => {
    const items = [
      { label: 'Новая сессия Claude', act: () => send({ t: 'claude', termId, mode: 'new' }) },
      { label: 'Продолжить последнюю', act: () => send({ t: 'claude', termId, mode: 'continue' }) },
      {
        label: 'Возобновить привязанную',
        act: () => send({ t: 'claude', termId, mode: 'resume' }),
        disabled: !term?.claudeSessionId
      },
      { label: 'Перезапустить shell', act: () => send({ t: 'claude', termId, mode: 'restart' }) },
      {
        label: term?.archived ? 'Вернуть из архива' : 'В архив',
        act: () => send({ t: 'archive', termId, archived: !term?.archived })
      },
      { label: fontSize > 9 ? 'Шрифт меньше' : 'Шрифт больше', act: () => setFontSize((f) => (f > 9 ? 9 : 11)) }
    ].filter((i) => !i.disabled)
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...items.map((i) => i.label), 'Отмена'], cancelButtonIndex: items.length },
        (i) => items[i]?.act()
      )
    } else {
      Alert.alert('Действия', undefined, [...items.map((i) => ({ text: i.label, onPress: i.act })), { text: 'Отмена' }])
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: term?.name ?? 'Терминал',
      headerRight: () => (
        <Pressable onPress={menu} hitSlop={10}>
          <Text style={{ color: C.accent, fontSize: 22 }}>⋯</Text>
        </Pressable>
      )
    })
  })

  const sendPrompt = (): void => {
    const t = text.trim()
    if (!t) return
    send({ t: 'prompt', termId, text: t })
    setText('')
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={s.statusRow}>
        <View style={[s.dot, { backgroundColor: STATUS_COLOR[term?.status ?? 'none'] }]} />
        <Text style={s.statusText}>
          {term ? STATUS_LABEL[term.status] : 'терминал удалён'}
          {term?.claudeSessionId ? ` · ${term.claudeSessionId.slice(0, 8)}` : ''}
          {!hostOnline ? ' · Mac не в сети' : ''}
        </Text>
      </View>
      <ScrollView
        ref={scroll}
        style={s.screen}
        contentContainerStyle={s.screenContent}
        scrollEventThrottle={100}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
          atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40
        }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text style={[s.mono, { fontSize, lineHeight: fontSize * 1.35 }]} selectable>
            {history?.length ? (
              <>
                <StyledScreen lines={history} />
                {'\n'}
              </>
            ) : null}
            {lines?.length ? (
              <StyledScreen lines={lines} />
            ) : (
              screen || (hostOnline ? '(экран пуст — ожидание вывода)' : '')
            )}
          </Text>
        </ScrollView>
      </ScrollView>
      <ScrollView horizontal style={s.keys} contentContainerStyle={s.keysContent} keyboardShouldPersistTaps="always">
        {KEYS.map((k) => (
          <Pressable key={k.key} style={s.keyBtn} onPress={() => send({ t: 'key', termId, key: k.key })}>
            <Text style={s.keyText}>{k.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Промпт или команда (/model, ! ls)…"
          placeholderTextColor={C.muted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={[s.sendBtn, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim()} onPress={sendPrompt}>
          <Text style={s.sendText}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: C.muted, fontSize: 12 },
  screen: { flex: 1, backgroundColor: C.surface2, marginHorizontal: 8, borderRadius: 8 },
  screenContent: { padding: 8 },
  mono: { color: C.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  keys: { flexGrow: 0, marginTop: 8 },
  keysContent: { paddingHorizontal: 8, gap: 6 },
  keyBtn: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  keyText: { color: C.text, fontSize: 13 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 8 },
  input: {
    flex: 1,
    backgroundColor: C.surface,
    color: C.text,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxHeight: 120,
    fontSize: 14
  },
  sendBtn: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { color: '#11111b', fontSize: 16, fontWeight: '700' }
})
