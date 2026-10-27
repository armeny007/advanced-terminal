import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { pair, parsePairing } from '../link'
import { C } from '../theme'

export function PairScreen(): React.JSX.Element {
  const [perm, requestPerm] = useCameraPermissions()
  const [scanning, setScanning] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (c: string): Promise<void> => {
    if (busy) return
    if (!parsePairing(c)) {
      Alert.alert('Неверный код', 'Ожидается код вида advterm://pair?relay=…&key=…')
      return
    }
    setBusy(true)
    await pair(c)
    setBusy(false)
  }

  const startScan = async (): Promise<void> => {
    if (!perm?.granted) {
      const r = await requestPerm()
      if (!r.granted) return
    }
    setScanning(true)
  }

  return (
    <View style={s.root}>
      <Text style={s.title}>Advanced Terminal</Text>
      <Text style={s.hint}>
        На Mac откройте 📱 «Мобильное приложение», создайте код сопряжения и отсканируйте QR — или
        вставьте код вручную.
      </Text>
      {scanning ? (
        <View style={s.cameraWrap}>
          <CameraView
            style={s.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(r) => {
              if (r.data && parsePairing(r.data)) {
                setScanning(false)
                void submit(r.data)
              }
            }}
          />
          <Pressable style={s.btn} onPress={() => setScanning(false)}>
            <Text style={s.btnText}>Отмена</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={[s.btn, s.primary]} onPress={startScan}>
          <Text style={s.btnText}>Сканировать QR</Text>
        </Pressable>
      )}
      <TextInput
        style={s.input}
        value={code}
        onChangeText={setCode}
        placeholder="advterm://pair?relay=…&key=…"
        placeholderTextColor={C.muted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      <Pressable style={[s.btn, !code.trim() && s.disabled]} disabled={!code.trim()} onPress={() => submit(code)}>
        <Text style={s.btnText}>Подключить</Text>
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 20, paddingTop: 80, gap: 14 },
  title: { color: C.text, fontSize: 24, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 14, lineHeight: 20 },
  cameraWrap: { gap: 10 },
  camera: { height: 280, borderRadius: 12, overflow: 'hidden' },
  input: {
    backgroundColor: C.surface,
    color: C.text,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 70,
    fontSize: 13
  },
  btn: { backgroundColor: C.surface, borderRadius: 10, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  primary: { backgroundColor: C.accent, borderColor: C.accent },
  disabled: { opacity: 0.4 },
  btnText: { color: C.text, fontSize: 15, fontWeight: '500' }
})
