import { describe, expect, it } from 'vitest'
import {
  findTerminalQuickCommandConflictForAction,
  findTerminalQuickCommandKeybindingConflict,
  normalizeTerminalQuickCommandKeybinding,
  resolveTerminalQuickCommandById,
  resolveTerminalQuickCommandKeybinding
} from './terminal-quick-command-keybindings'
import type { TerminalQuickCommand } from './types'

function command(
  id: string,
  keybinding: string,
  scope: TerminalQuickCommand['scope'] = { type: 'global' }
): TerminalQuickCommand {
  return {
    id,
    label: id,
    action: 'terminal-command',
    command: `echo ${id}`,
    appendEnter: true,
    scope,
    keybinding
  }
}

describe('terminal quick command keybindings', () => {
  it('normalizes generic chords and rejects unsafe inputs', () => {
    expect(normalizeTerminalQuickCommandKeybinding(' cmd + shift + g ')).toEqual({
      ok: true,
      value: 'Cmd+Shift+G'
    })
    expect(normalizeTerminalQuickCommandKeybinding('G')).toMatchObject({ ok: false })
    expect(normalizeTerminalQuickCommandKeybinding('Shift')).toMatchObject({ ok: false })
  })

  it('treats Mod and the platform primary modifier as the same physical chord', () => {
    const commands = [command('status', 'Cmd+Shift+G')]
    expect(
      findTerminalQuickCommandKeybindingConflict({
        binding: 'Mod+Shift+G',
        commands,
        platform: 'darwin'
      })
    ).toMatchObject({ ownerId: 'sidebar.sourceControl.toggle', ownerType: 'built-in' })

    expect(
      findTerminalQuickCommandKeybindingConflict({
        binding: 'Ctrl+Shift+G',
        commands: [],
        platform: 'linux'
      })
    ).toMatchObject({ ownerId: 'sidebar.sourceControl.toggle', ownerType: 'built-in' })
  })

  it('blocks duplicate commands regardless of scope and reserved fixed chords', () => {
    const commands = [command('global', 'Mod+Alt+U')]
    expect(
      findTerminalQuickCommandKeybindingConflict({
        binding: 'Mod+Alt+U',
        commands,
        commandId: 'repo',
        platform: 'darwin'
      })
    ).toMatchObject({ ownerId: 'global', ownerType: 'quick-command' })
    expect(
      findTerminalQuickCommandKeybindingConflict({
        binding: 'Mod+Enter',
        commands,
        platform: 'darwin',
        reservedBindings: [{ binding: 'Mod+Enter', label: 'Save dialog' }]
      })
    ).toMatchObject({ ownerLabel: 'Save dialog', ownerType: 'reserved' })
  })

  it('blocks dynamic plugin definitions in both editing directions', () => {
    const pluginDefinition = {
      id: 'plugin:tasks/run' as const,
      title: 'Run Tasks — Tasks',
      group: 'Plugins',
      scope: 'global' as const,
      searchKeywords: ['plugin', 'tasks'],
      defaultBindings: {
        darwin: ['Mod+Alt+U'],
        linux: ['Mod+Alt+U'],
        win32: ['Mod+Alt+U']
      }
    }
    const commands = [command('status', 'Mod+Alt+U')]

    expect(
      findTerminalQuickCommandKeybindingConflict({
        binding: 'Mod+Alt+U',
        commands: [],
        platform: 'darwin',
        additionalDefinitions: [pluginDefinition]
      })
    ).toMatchObject({ ownerId: 'plugin:tasks/run', ownerType: 'plugin' })
    expect(
      findTerminalQuickCommandConflictForAction({
        actionId: 'plugin:tasks/run',
        commands,
        platform: 'darwin',
        additionalDefinitions: [pluginDefinition]
      })
    ).toMatchObject({ ownerId: 'status' })
  })

  it('expands digit-index built-in families in both conflict directions', () => {
    expect(
      findTerminalQuickCommandKeybindingConflict({
        binding: 'Mod+2',
        commands: [],
        platform: 'darwin'
      })
    ).toMatchObject({ ownerId: 'workspace.selectByIndex' })

    expect(
      findTerminalQuickCommandConflictForAction({
        actionId: 'workspace.selectByIndex',
        commands: [command('two', 'Mod+2')],
        platform: 'darwin',
        keybindings: { 'workspace.selectByIndex': ['Mod+1'] }
      })
    ).toMatchObject({ ownerId: 'two' })
  })

  it('resolves punctuation using the generic layout-aware matcher', () => {
    const commands = [command('punctuation', 'Mod+Slash')]
    expect(
      resolveTerminalQuickCommandKeybinding({
        commands,
        input: { key: '/', code: 'IntlRo', meta: true },
        platform: 'darwin',
        repoId: null
      })
    ).toMatchObject({ status: 'matched', command: { id: 'punctuation' } })
  })

  it('reports an ineligible repo owner without executing elsewhere', () => {
    const commands = [command('repo', 'Mod+Alt+U', { type: 'repo', repoId: 'repo-1' })]
    expect(
      resolveTerminalQuickCommandKeybinding({
        commands,
        input: { key: 'u', code: 'KeyU', meta: true, alt: true },
        platform: 'darwin',
        repoId: 'repo-2'
      })
    ).toMatchObject({ status: 'ineligible', command: { id: 'repo' } })
  })

  it('fails closed for duplicate, invalid, conflicted, deleted, and stale commands', () => {
    const duplicate = [command('one', 'Mod+Alt+U'), command('two', 'Cmd+Alt+U')]
    expect(
      resolveTerminalQuickCommandKeybinding({
        commands: duplicate,
        input: { key: 'u', code: 'KeyU', meta: true, alt: true },
        platform: 'darwin',
        repoId: null
      })
    ).toEqual({ status: 'ambiguous' })
    expect(
      resolveTerminalQuickCommandById({
        commands: [command('built-in-conflict', 'Mod+Shift+G')],
        commandId: 'built-in-conflict',
        platform: 'darwin',
        repoId: null
      })
    ).toEqual({ status: 'conflicted' })
    expect(
      resolveTerminalQuickCommandById({
        commands: [],
        commandId: 'deleted',
        platform: 'darwin',
        repoId: null
      })
    ).toEqual({ status: 'none' })
  })
})
