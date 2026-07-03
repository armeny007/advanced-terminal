// Git worktrees: терминалы, привязанные к отдельным веткам (V2).
import { execFile } from 'child_process'
import { mkdir } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { promisify } from 'util'
import type { TermInfo, WorktreeInfo } from '../../shared/types'
import type { PtyManager, Store } from '../contracts'

const execFileAsync = promisify(execFile)

/** Все git-вызовы — через execFile с массивом аргументов (пути с пробелами) */
async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })
  return stdout
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export async function listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
  const out = await git(projectPath, 'worktree', 'list', '--porcelain')
  const result: WorktreeInfo[] = []
  let cur: WorktreeInfo | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice('worktree '.length), branch: '', head: '' }
      result.push(cur)
    } else if (cur && line.startsWith('HEAD ')) {
      cur.head = line.slice('HEAD '.length)
    } else if (cur && line.startsWith('branch ')) {
      cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    }
  }
  return result
}

export async function createWorktreeTerminal(
  store: Store,
  ptyManager: PtyManager,
  opts: { folderId: string; projectPath: string; branch: string; name?: string }
): Promise<TermInfo> {
  const { folderId, projectPath, branch, name } = opts
  const wtBase = join(dirname(projectPath), basename(projectPath) + '-worktrees')
  // 'feature/foo' -> 'feature-foo': недопустимые для директории символы заменяем на '-'
  const wtPath = join(wtBase, branch.replace(/[^\w.-]+/g, '-'))
  await mkdir(wtBase, { recursive: true })

  let branchExists = true
  try {
    await git(projectPath, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`)
  } catch {
    branchExists = false
  }
  if (branchExists) {
    await git(projectPath, 'worktree', 'add', wtPath, branch)
  } else {
    await git(projectPath, 'worktree', 'add', '-b', branch, wtPath)
  }

  const term = ptyManager.createTerminal({
    folderId,
    cwd: wtPath,
    name: name || branch,
    worktree: { projectPath, worktreePath: wtPath, branch }
  })

  // setup-скрипт проекта выполняется в новом терминале на глазах у пользователя
  const setupScript = store.getProjectConfig(projectPath).setupScript
  if (setupScript.trim()) ptyManager.writeToTerminal(term.id, setupScript + '\r')

  return term
}

export async function removeWorktree(
  store: Store,
  ptyManager: PtyManager,
  termId: string
): Promise<{ ok: boolean; error?: string }> {
  const term = store.getTerminal(termId)
  if (!term) return { ok: false, error: 'Терминал не найден' }
  const wt = term.worktree
  if (!wt) return { ok: false, error: 'Терминал не привязан к worktree' }
  try {
    await git(wt.projectPath, 'worktree', 'remove', '--force', wt.worktreePath)
  } catch (e) {
    return { ok: false, error: errText(e) }
  }
  ptyManager.killTerminal(termId)
  store.removeTerminal(termId)
  return { ok: true }
}

/** База для диффа: merge-base HEAD и основной ветки (origin/HEAD → main → master → первый коммит) */
async function resolveDiffBase(cwd: string): Promise<string> {
  let ref: string | null = null
  try {
    ref = (await git(cwd, 'rev-parse', '--abbrev-ref', 'origin/HEAD')).trim() || null
  } catch {
    // origin/HEAD не настроен
  }
  if (!ref) {
    for (const cand of ['main', 'master']) {
      try {
        await git(cwd, 'rev-parse', '--verify', '--quiet', `refs/heads/${cand}`)
        ref = cand
        break
      } catch {
        // ветки нет
      }
    }
  }
  if (!ref) {
    // репозиторий без main/master — берём первый коммит
    const roots = (await git(cwd, 'rev-list', '--max-parents=0', 'HEAD')).trim().split('\n')
    return roots[roots.length - 1].trim()
  }
  try {
    return (await git(cwd, 'merge-base', 'HEAD', ref)).trim()
  } catch {
    return ref
  }
}

export async function worktreeDiff(store: Store, termId: string): Promise<string> {
  const term = store.getTerminal(termId)
  const wt = term?.worktree
  if (!wt) return 'Ошибка: терминал не привязан к worktree'
  try {
    const cwd = wt.worktreePath
    const base = await resolveDiffBase(cwd)
    const status = (await git(cwd, 'status', '--short')).trimEnd()
    // git diff <base> показывает и закоммиченное в ветке, и незакоммиченное
    const diff = await git(cwd, 'diff', base)
    return (
      `Ветка: ${wt.branch} (база: ${base.slice(0, 12)})\n\n` +
      `Статус:\n${status || '(нет изменений)'}\n\n${diff}`
    )
  } catch (e) {
    return `Ошибка git: ${errText(e)}`
  }
}
