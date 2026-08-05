import { toast } from 'sonner'
import type { KeybindingDefinition, KeybindingInput } from '../../../shared/keybindings'
import {
  resolveTerminalQuickCommandById,
  resolveTerminalQuickCommandKeybinding,
  type QuickCommandKeybindingResolution
} from '../../../shared/terminal-quick-command-keybindings'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree-id'
import { isGitRepoKind } from '../../../shared/repo-kind'
import { useAppStore } from '@/store'
import { isFloatingWorkspacePanelFocused } from '@/lib/floating-workspace-terminal-actions'
import { runQuickCommandInNewTab } from '@/lib/run-quick-command-in-new-tab'
import { translate } from '@/i18n/i18n'

type FocusedQuickCommandContext = {
  element: HTMLElement
  worktreeId: string
  tabId: string
  getGroupId: () => string | null
  getCwd: () => string | null
}

type QuickCommandSourceContext = {
  worktreeId: string
  groupId: string
}

const focusedContexts = new Set<FocusedQuickCommandContext>()

export function registerFocusedQuickCommandContext(
  context: FocusedQuickCommandContext
): () => void {
  focusedContexts.add(context)
  return () => focusedContexts.delete(context)
}

function contextForTarget(
  target: EventTarget | null | undefined,
  worktreeId: string
): FocusedQuickCommandContext | null {
  if (!(target instanceof Node)) {
    return null
  }
  for (const context of focusedContexts) {
    if (context.worktreeId === worktreeId && context.element.contains(target)) {
      return context
    }
  }
  return null
}

function contextForActiveTerminal(
  worktreeId: string,
  groupId: string | null,
  tabId: string | null
): FocusedQuickCommandContext | null {
  if (!groupId || !tabId) {
    return null
  }
  for (const context of focusedContexts) {
    if (
      context.worktreeId === worktreeId &&
      context.tabId === tabId &&
      context.getGroupId() === groupId
    ) {
      return context
    }
  }
  return null
}

function repoIdForWorktree(worktreeId: string): string | null {
  if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
    return null
  }
  const store = useAppStore.getState()
  const candidate = getRepoIdFromWorktreeId(worktreeId)
  const repo = store.repos.find((entry) => entry.id === candidate)
  return repo && isGitRepoKind(repo) ? repo.id : null
}

function contextForSourceTab(sourceTabId: string): QuickCommandSourceContext | null {
  const store = useAppStore.getState()
  for (const [worktreeId, browserWorkspaces] of Object.entries(store.browserTabsByWorktree)) {
    const browserWorkspace = browserWorkspaces.find(
      (workspace) =>
        (workspace.pageIds ?? []).includes(sourceTabId) || workspace.activePageId === sourceTabId
    )
    if (!browserWorkspace) {
      continue
    }
    const unifiedTab = store.unifiedTabsByWorktree[worktreeId]?.find(
      (tab) => tab.contentType === 'browser' && tab.entityId === browserWorkspace.id
    )
    if (!unifiedTab) {
      return null
    }
    const group = store.groupsByWorktree[worktreeId]?.find((candidate) =>
      candidate.tabOrder.includes(unifiedTab.id)
    )
    if (group) {
      return { worktreeId, groupId: group.id }
    }
    return null
  }
  return null
}

function explainUnavailable(resolution: QuickCommandKeybindingResolution): void {
  if (resolution.status === 'ineligible') {
    toast.warning(
      translate(
        'auto.lib.quickCommandShortcutDispatch.repoMismatch',
        '“{{value0}}” is not available in this workspace.',
        { value0: resolution.command.label }
      )
    )
    return
  }
  if (resolution.status === 'ambiguous' || resolution.status === 'conflicted') {
    toast.warning(
      translate(
        'auto.lib.quickCommandShortcutDispatch.conflict',
        'This Quick Command shortcut has a conflict. Change it in Settings.'
      )
    )
  }
}

export type DispatchQuickCommandShortcutOptions = {
  input?: KeybindingInput
  commandId?: string
  platform: NodeJS.Platform
  target?: EventTarget | null
  floatingWorkspaceFocused?: boolean
  sourceTabId?: string
  additionalDefinitions?: readonly KeybindingDefinition[]
}

export function dispatchQuickCommandShortcut(
  options: DispatchQuickCommandShortcutOptions
): boolean {
  const store = useAppStore.getState()
  const commands = store.settings?.terminalQuickCommands ?? []
  const sourceContext = options.sourceTabId ? contextForSourceTab(options.sourceTabId) : null
  if (options.sourceTabId && !sourceContext) {
    return false
  }
  const floatingFocused =
    sourceContext?.worktreeId === FLOATING_TERMINAL_WORKTREE_ID ||
    (options.floatingWorkspaceFocused ?? isFloatingWorkspacePanelFocused())
  const worktreeId =
    sourceContext?.worktreeId ??
    (floatingFocused ? FLOATING_TERMINAL_WORKTREE_ID : store.activeWorktreeId)
  const repoId = worktreeId ? repoIdForWorktree(worktreeId) : null
  const common = {
    commands,
    platform: options.platform,
    repoId,
    keybindings: store.keybindings,
    additionalDefinitions: options.additionalDefinitions,
    reservedBindings: [{ binding: 'Mod+Enter', label: 'Save dialog' }]
  }
  const resolution = options.commandId
    ? resolveTerminalQuickCommandById({ ...common, commandId: options.commandId })
    : options.input
      ? resolveTerminalQuickCommandKeybinding({ ...common, input: options.input })
      : ({ status: 'none' } as const)

  if (resolution.status !== 'matched') {
    explainUnavailable(resolution)
    // Built-ins retain ownership when persisted Quick Command data becomes
    // conflicted; duplicate Quick Commands still consume the ambiguous chord.
    return resolution.status === 'ambiguous' || resolution.status === 'ineligible'
  }
  if (!worktreeId) {
    toast.warning(
      translate(
        'auto.lib.quickCommandShortcutDispatch.noWorkspace',
        'Open a workspace before running this Quick Command.'
      )
    )
    return true
  }
  const activeGroupId =
    sourceContext?.groupId ??
    store.activeGroupIdByWorktree[worktreeId] ??
    store.groupsByWorktree[worktreeId]?.[0]?.id ??
    null
  const activeGroup = store.groupsByWorktree[worktreeId]?.find(
    (group) => group.id === activeGroupId
  )
  const allowTerminalChromeFallback =
    !sourceContext &&
    (floatingFocused || (store.activeView === 'terminal' && store.activeTabType === 'terminal'))
  const focusedContext =
    contextForTarget(options.target, worktreeId) ??
    (allowTerminalChromeFallback
      ? contextForActiveTerminal(worktreeId, activeGroupId, activeGroup?.activeTabId ?? null)
      : null)
  const groupId = focusedContext?.getGroupId() ?? activeGroupId
  if (!groupId) {
    toast.warning(
      translate(
        'auto.lib.quickCommandShortcutDispatch.noGroup',
        'No tab group is available for this Quick Command.'
      )
    )
    return true
  }
  const workspaceCwd = store.getKnownWorktreeById(worktreeId)?.path ?? null
  runQuickCommandInNewTab({
    command: resolution.command,
    worktreeId,
    groupId,
    initialCwd: focusedContext?.getCwd() ?? workspaceCwd
  })
  return true
}
