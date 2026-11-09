import { useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { Question, QuestionAnswer } from '../../../src/shared/types'
import { send } from '../link'
import { useStore } from '../store'
import { C } from '../theme'
import type { Routes } from '../routes'

/** возраст вопроса: «5 мин», «2 ч», «3 д» */
function age(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (m < 60) return `${m} мин`
  if (m < 60 * 24) return `${Math.round(m / 60)} ч`
  return `${Math.round(m / 60 / 24)} д`
}

function QuestionCard({
  q,
  termName,
  onOpenTerm
}: {
  q: Question
  termName: string
  onOpenTerm: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const answer = (a: QuestionAnswer): void => send({ t: 'answer', id: q.id, answer: a })
  const sendText = (): void => {
    const t = text.trim()
    if (!t) return
    answer({ kind: 'text', text: t })
    setText('')
  }
  const btn = (label: string, a: QuestionAnswer, key?: number): React.JSX.Element => (
    <Pressable key={key ?? label} style={s.btn} onPress={() => answer(a)}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  )

  return (
    <View style={[s.card, q.state === 'deferred' && s.deferred]}>
      <View style={s.head}>
        <Pressable style={{ flex: 1 }} onPress={onOpenTerm} hitSlop={6}>
          <Text style={s.term} numberOfLines={1}>
            {termName}
            <Text style={s.muted}>
              {'  '}
              {q.state === 'deferred' ? 'отложен · ' : ''}
              {age(q.createdAt)}
            </Text>
          </Text>
        </Pressable>
        <Pressable hitSlop={10} onPress={() => send({ t: 'dismiss', id: q.id })}>
          <Text style={s.dismiss}>✕</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => setOpen((v) => !v)} disabled={!q.detail}>
        <Text style={s.title}>
          {q.detail ? (open ? '▾ ' : '▸ ') : ''}
          {q.title}
        </Text>
      </Pressable>
      {open && !!q.detail && (
        <Text style={s.detail} selectable>
          {q.detail}
        </Text>
      )}
      <View style={s.actions}>
        {q.options.map((o, i) =>
          btn(q.source === 'tool' ? `${i + 1}. ${o.label}` : o.label, { kind: 'option', index: i }, i)
        )}
        {q.source === 'cli' && (
          <>
            {btn('Да', { kind: 'yes' })}
            {btn('Нет', { kind: 'no' })}
            {btn('Откладываем', { kind: 'defer' })}
            {btn('Поясни', { kind: 'explain' })}
          </>
        )}
      </View>
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Свой ответ…"
          placeholderTextColor={C.muted}
          multiline
          autoCorrect={false}
        />
        <Pressable style={[s.sendBtn, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim()} onPress={sendText}>
          <Text style={s.sendText}>➤</Text>
        </Pressable>
      </View>
    </View>
  )
}

/** Вопросы сессий владельцу: старые сверху, отложенные — в конце */
export function QuestionsScreen({ route, navigation }: NativeStackScreenProps<Routes, 'Questions'>): React.JSX.Element {
  const termId = route.params?.termId
  const questions = useStore((s) => s.questions)
  const terminals = useStore((s) => s.terminals)
  const hostOnline = useStore((s) => s.hostOnline)
  const list = questions
    .filter((q) => !termId || q.termId === termId)
    .sort((a, b) => Number(a.state === 'deferred') - Number(b.state === 'deferred') || a.createdAt - b.createdAt)

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {termId && questions.length > list.length && (
        <Pressable style={s.showAll} onPress={() => navigation.setParams({ termId: undefined })}>
          <Text style={s.showAllText}>Показать все {questions.length}</Text>
        </Pressable>
      )}
      <FlatList
        data={list}
        keyExtractor={(q) => q.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item: q }) => {
          const term = terminals.find((t) => t.id === q.termId)
          return (
            <QuestionCard
              q={q}
              termName={term?.name ?? 'терминал удалён'}
              onOpenTerm={() => term && navigation.navigate('Terminal', { termId: term.id })}
            />
          )
        }}
        ListEmptyComponent={
          <Text style={s.empty}>{hostOnline ? 'Открытых вопросов нет' : 'Ожидание данных с Mac…'}</Text>
        }
      />
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10
  },
  deferred: { opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  term: { color: C.accent, fontSize: 13 },
  muted: { color: C.muted, fontSize: 12 },
  dismiss: { color: C.muted, fontSize: 16, paddingHorizontal: 4 },
  title: { color: C.text, fontSize: 16, fontWeight: '600', marginTop: 8 },
  detail: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    padding: 10,
    backgroundColor: C.surface2,
    borderRadius: 8
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  btn: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  btnText: { color: C.text, fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 },
  input: {
    flex: 1,
    backgroundColor: C.surface2,
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
  sendText: { color: '#11111b', fontSize: 16, fontWeight: '700' },
  showAll: { alignItems: 'center', paddingTop: 10 },
  showAllText: { color: C.accent, fontSize: 13 },
  empty: { color: C.muted, textAlign: 'center', marginTop: 60 }
})
