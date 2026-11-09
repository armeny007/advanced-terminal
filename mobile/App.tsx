import { useEffect } from 'react'
import { AppState, Linking } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { DarkTheme, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ensureLive, loadPairing, pair, parsePairing } from './src/link'
import { useStore } from './src/store'
import { C } from './src/theme'
import type { Routes } from './src/routes'
import { PairScreen } from './src/screens/PairScreen'
import { TerminalsScreen } from './src/screens/TerminalsScreen'
import { TerminalScreen } from './src/screens/TerminalScreen'
import { QuestionsScreen } from './src/screens/QuestionsScreen'

const Stack = createNativeStackNavigator<Routes>()

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.surface, text: C.text, primary: C.accent, border: C.border }
}

export default function App(): React.JSX.Element {
  const paired = useStore((s) => s.pairing !== null)
  useEffect(() => {
    void loadPairing()
    // сопряжение по ссылке (QR с deep link / simctl openurl)
    const onUrl = (url: string | null | undefined): void => {
      if (url && parsePairing(url)) void pair(url)
    }
    Linking.getInitialURL().then(onUrl)
    const sub = Linking.addEventListener('url', (e) => onUrl(e.url))
    // возврат из фона: сокет мог умереть молча, пока рантайм спал
    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active') ensureLive()
    })
    return () => {
      sub.remove()
      appSub.remove()
    }
  }, [])

  return (
    <NavigationContainer theme={theme}>
      <StatusBar style="light" />
      {paired ? (
        <Stack.Navigator>
          <Stack.Screen name="Terminals" component={TerminalsScreen} options={{ title: 'Терминалы' }} />
          <Stack.Screen name="Terminal" component={TerminalScreen} />
          <Stack.Screen name="Questions" component={QuestionsScreen} options={{ title: 'Вопросы' }} />
        </Stack.Navigator>
      ) : (
        <PairScreen />
      )}
    </NavigationContainer>
  )
}
