// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalQuickCommand } from '../../../shared/types'

const { mockRun, mockToast, mockState } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockToast: vi.fn(),
  mockState: {
    settings: { terminalQuickCommands: [] as TerminalQuickCommand[] },
    keybindings: {},
    activeWorktreeId: 'repo-1::/workspace',
    activeView: 'terminal',
    activeTabType: 'terminal',
    activeGroupIdByWorktree: { 'repo-1::/workspace': 'group-1' } as Record<string, string>,
    groupsByWorktree: {} as Record<
      string,
      { id: string; activeTabId?: string; tabOrder: string[] }[]
    >,
    browserTabsByWorktree: {} as Record<string, { id: string; pageIds: string[] }[]>,
    unifiedTabsByWorktree: {} as Record<
      string,
      { id: string; contentType: string; entityId: string }[]
    >,
    repos: [{ id: 'repo-1', kind: 'git' }],
    getKnownWorktreeById: vi.fn(() => ({ path: '/workspace' }))
  }
}))

vi.mock('@/store', () => ({
  useAppStore: { getState: () => mockState }
}))
vi.mock('@/lib/run-quick-command-in-new-tab', () => ({
  runQuickCommandInNewTab: mockRun
}))
vi.mock('@/lib/floating-workspace-terminal-actions', () => ({
  isFloatingWorkspacePanelFocused: () => false
}))
vi.mock('sonner', () => ({ toast: { warning: mockToast } }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

import {
  dispatchQuickCommandShortcut,
  registerFocusedQuickCommandContext
} from './quick-command-shortcut-dispatch'

function command(
  id = 'status',
  scope: TerminalQuickCommand['scope'] = { type: 'global' }
): TerminalQuickCommand {
  return {
    id,
    label: 'Status',
    action: 'terminal-command',
    command: 'git status',
    appendEnter: true,
    keybinding: 'Mod+Alt+U',
    scope
  }
}

describe('quick command shortcut dispatch', () => {
  beforeEach(() => {
    mockRun.mockReset()
    mockToast.mockReset()
    mockState.settings.terminalQuickCommands = [command()]
    mockState.activeWorktreeId = 'repo-1::/workspace'
    mockState.activeView = 'terminal'
    mockState.activeTabType = 'terminal'
    mockState.activeGroupIdByWorktree = { 'repo-1::/workspace': 'group-1' }
    mockState.groupsByWorktree = {
      'repo-1::/workspace': [{ id: 'group-1', activeTabId: 'terminal-1', tabOrder: ['terminal-1'] }]
    }
    mockState.browserTabsByWorktree = {}
    mockState.unifiedTabsByWorktree = {}
    mockState.getKnownWorktreeById.mockReturnValue({ path: '/workspace' })
  })

  it('runs one current command in the active group with workspace cwd fallback', () => {
    const handled = dispatchQuickCommandShortcut({
      input: { key: 'u', code: 'KeyU', meta: true, alt: true },
      platform: 'darwin'
    })

    expect(handled).toBe(true)
    expect(mockRun).toHaveBeenCalledOnce()
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'repo-1::/workspace',
        groupId: 'group-1',
        initialCwd: '/workspace'
      })
    )
  })

  it('uses the focused terminal pane group and live cwd', () => {
    const container = document.createElement('div')
    const target = document.createElement('textarea')
    container.appendChild(target)
    const unregister = registerFocusedQuickCommandContext({
      element: container,
      worktreeId: 'repo-1::/workspace',
      tabId: 'terminal-1',
      getGroupId: () => 'focused-group',
      getCwd: () => '/workspace/packages/app'
    })

    dispatchQuickCommandShortcut({
      commandId: 'status',
      platform: 'darwin',
      target
    })
    unregister()

    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'focused-group', initialCwd: '/workspace/packages/app' })
    )
  })

  it('uses the active terminal pane cwd when focus is on terminal chrome', () => {
    const container = document.createElement('div')
    const toolbarButton = document.createElement('button')
    const unregister = registerFocusedQuickCommandContext({
      element: container,
      worktreeId: 'repo-1::/workspace',
      tabId: 'terminal-1',
      getGroupId: () => 'group-1',
      getCwd: () => '/workspace/packages/app'
    })

    dispatchQuickCommandShortcut({
      commandId: 'status',
      platform: 'darwin',
      target: toolbarButton
    })
    unregister()

    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-1', initialCwd: '/workspace/packages/app' })
    )
  })

  it('keeps workspace cwd fallback outside the active terminal view', () => {
    mockState.activeTabType = 'browser'
    const container = document.createElement('div')
    const unregister = registerFocusedQuickCommandContext({
      element: container,
      worktreeId: 'repo-1::/workspace',
      tabId: 'terminal-1',
      getGroupId: () => 'group-1',
      getCwd: () => '/workspace/packages/hidden-terminal'
    })

    dispatchQuickCommandShortcut({
      commandId: 'status',
      platform: 'darwin',
      target: document.createElement('button')
    })
    unregister()

    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ initialCwd: '/workspace' }))
  })

  it('revalidates edits and deletion at IPC dispatch time', () => {
    mockState.settings.terminalQuickCommands = []
    expect(dispatchQuickCommandShortcut({ commandId: 'status', platform: 'darwin' })).toBe(false)
    expect(mockRun).not.toHaveBeenCalled()

    mockState.settings.terminalQuickCommands = [command('renamed')]
    expect(dispatchQuickCommandShortcut({ commandId: 'renamed', platform: 'darwin' })).toBe(true)
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.objectContaining({ id: 'renamed' }) })
    )
  })

  it('uses the browser guest source tab instead of the active workspace', () => {
    mockState.groupsByWorktree = {
      ...mockState.groupsByWorktree,
      'repo-2::/source': [
        { id: 'source-group', activeTabId: 'unified-browser', tabOrder: ['unified-browser'] }
      ]
    }
    mockState.browserTabsByWorktree = {
      'repo-2::/source': [{ id: 'browser-workspace', pageIds: ['browser-1'] }]
    }
    mockState.unifiedTabsByWorktree = {
      'repo-2::/source': [
        { id: 'unified-browser', contentType: 'browser', entityId: 'browser-workspace' }
      ]
    }
    mockState.getKnownWorktreeById.mockReturnValue({ path: '/source' })

    expect(
      dispatchQuickCommandShortcut({
        commandId: 'status',
        sourceTabId: 'browser-1',
        platform: 'darwin'
      })
    ).toBe(true)
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'repo-2::/source',
        groupId: 'source-group',
        initialCwd: '/source'
      })
    )
  })

  it('rejects a stale browser guest source tab', () => {
    expect(
      dispatchQuickCommandShortcut({
        commandId: 'status',
        sourceTabId: 'deleted-browser',
        platform: 'darwin'
      })
    ).toBe(false)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('explains repo mismatch and never retargets the command', () => {
    mockState.settings.terminalQuickCommands = [
      command('repo-only', { type: 'repo', repoId: 'repo-2' })
    ]

    expect(
      dispatchQuickCommandShortcut({
        input: { key: 'u', code: 'KeyU', meta: true, alt: true },
        platform: 'darwin'
      })
    ).toBe(true)
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledOnce()
  })

  it('fails closed for duplicate ownership', () => {
    mockState.settings.terminalQuickCommands = [command('one'), command('two')]

    expect(
      dispatchQuickCommandShortcut({
        input: { key: 'u', code: 'KeyU', meta: true, alt: true },
        platform: 'darwin'
      })
    ).toBe(true)
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledOnce()
  })

  it('warns but yields conflicted ownership to the built-in dispatcher', () => {
    mockState.settings.terminalQuickCommands = [
      { ...command('conflicted'), keybinding: 'Mod+Shift+G' }
    ]

    expect(
      dispatchQuickCommandShortcut({
        input: { key: 'g', code: 'KeyG', meta: true, shift: true },
        platform: 'darwin'
      })
    ).toBe(false)
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledOnce()
  })

  it('does not shadow a dynamic plugin shortcut', () => {
    expect(
      dispatchQuickCommandShortcut({
        input: { key: 'u', code: 'KeyU', meta: true, alt: true },
        platform: 'darwin',
        additionalDefinitions: [
          {
            id: 'plugin:tasks/run',
            title: 'Run Tasks — Tasks',
            group: 'Plugins',
            scope: 'global',
            searchKeywords: ['plugin', 'tasks'],
            defaultBindings: {
              darwin: ['Mod+Alt+U'],
              linux: ['Mod+Alt+U'],
              win32: ['Mod+Alt+U']
            }
          }
        ]
      })
    ).toBe(false)
    expect(mockRun).not.toHaveBeenCalled()
  })
})
