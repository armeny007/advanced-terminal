import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MobileTerm } from '../../../src/shared/mobile-protocol'
import { send, unpair } from '../link'
import { setState, useStore } from '../store'
import { C, STATUS_COLOR, STATUS_LABEL } from '../theme'
import type { Routes } from '../routes'

export function TerminalsScreen({ navigation }: NativeStackScreenProps<Routes, 'Terminals'>): React.JSX.Element {
  const folders = useStore((s) => s.folders)
  const terminals = useStore((s) => s.terminals)
  const connected = useStore((s) => s.connected)
  const hostOnline = useStore((s) => s.hostOnline)
  const attention = useStore((s) => s.attention)

  const sections = folders.map((f) => ({
    folder: f,
    data: terminals
      .filter((t) => t.folderId === f.id)
      .sort((a, b) => Number(!!a.archived) - Number(!!b.archived))
  }))

  const status = !connected ? 'нет связи с релеем…' : !hostOnline ? 'Mac не в сети' : null
  const attTerm = attention ? terminals.find((t) => t.id === attention.termId) : undefined

  const open = (t: MobileTerm): void => navigation.navigate('Terminal', { termId: t.id })

  return (
    <View style={s.root}>
      {status && <Text style={s.banner}>{status}</Text>}
      {attention && attTerm && (
        <Pressable
          style={s.attention}
          onPress={() => {
            setState({ attention: null })
            open(attTerm)
          }}
        >
          <View style={[s.dot, { backgroundColor: STATUS_COLOR[attention.status] }]} />
          <Text style={s.attText} numberOfLines={2}>
            {attTerm.name}: {attention.completed ? 'задача завершена' : STATUS_LABEL[attention.status]}
            {attention.message ? ` — ${attention.message}` : ''}
          </Text>
          <Pressable onPress={() => setState({ attention: null })} hitSlop={10}>
            <Text style={s.attClose}>✕</Text>
          </Pressable>
        </Pressable>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={s.header}>
            <Text style={s.headerText}>
              {section.folder.icon ? `${section.folder.icon} ` : ''}
              {section.folder.name}
            </Text>
            <Pressable hitSlop={10} onPress={() => send({ t: 'newterm', folderId: section.folder.id })}>
              <Text style={s.headerAdd}>＋</Text>
            </Pressable>
          </View>
        )}
        renderItem={({ item: t }) => (
          <Pressable style={[s.row, t.archived && s.archived]} onPress={() => open(t)}>
            <View style={[s.dot, { backgroundColor: STATUS_COLOR[t.status] }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>
                {t.archived ? '📦 ' : ''}
                {t.name}
                {t.sshHost ? `  ⇅ ${t.sshHost}` : ''}
              </Text>
              <Text style={s.sub} numberOfLines={1}>
                {STATUS_LABEL[t.status]} · {t.cwd.replace(/^\/Users\/[^/]+/, '~')}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={s.empty}>{hostOnline ? 'Нет терминалов' : 'Ожидание данных с Mac…'}</Text>}
        ListFooterComponent={
          <Pressable
            style={s.unpair}
            onPress={() =>
              Alert.alert('Отключить от Mac?', 'Код сопряжения будет удалён с телефона.', [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Отключить', style: 'destructive', onPress: () => void unpair() }
              ])
            }
          >
            <Text style={s.unpairText}>Отключить от Mac</Text>
          </Pressable>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  banner: { backgroundColor: C.warn, color: '#11111b', textAlign: 'center', padding: 6, fontSize: 13 },
  attention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.accent
  },
  attText: { color: C.text, flex: 1, fontSize: 13 },
  attClose: { color: C.muted, fontSize: 16, paddingHorizontal: 4 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6
  },
  headerText: { color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 },
  headerAdd: { color: C.accent, fontSize: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border
  },
  archived: { opacity: 0.5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: C.text, fontSize: 15 },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  empty: { color: C.muted, textAlign: 'center', marginTop: 60 },
  unpair: { alignItems: 'center', padding: 24 },
  unpairText: { color: C.danger, fontSize: 13 }
})
