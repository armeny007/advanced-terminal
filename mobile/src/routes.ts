export type Routes = {
  Terminals: undefined
  Terminal: { termId: string }
  /** вопросы сессий; termId — только этого терминала */
  Questions: { termId?: string } | undefined
}
