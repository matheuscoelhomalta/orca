import { describe, expect, it } from 'vitest'
import type { KeybindingDefinition } from '../../../../shared/keybindings'
import type { ActivePluginCommand } from '@/store/plugin-panels'
import { buildShortcutDefinitionCatalog } from './shortcut-definition-catalog'
import { groupDefinitions } from './shortcut-groups'

const pluginDefinition: KeybindingDefinition = {
  id: 'plugin:orca-samples.tasks/open',
  title: 'Open Tasks — Tasks',
  group: 'Plugins',
  scope: 'global',
  searchKeywords: ['plugin', 'tasks'],
  defaultBindings: {
    darwin: ['Mod+Alt+T'],
    linux: ['Mod+Alt+T'],
    win32: ['Mod+Alt+T']
  }
}

describe('shortcut groups', () => {
  it('includes dynamic plugin command definitions in Settings', () => {
    expect(groupDefinitions([], [pluginDefinition])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Plugins',
          items: [pluginDefinition]
        })
      ])
    )
  })

  it('reports a plugin default that shadows a built-in shortcut', () => {
    const command: ActivePluginCommand = {
      pluginKey: 'orca-samples.tasks',
      pluginName: 'Tasks',
      id: 'open',
      title: 'Open Tasks',
      context: 'global',
      handler: { type: 'built-in', action: 'view.tasks' },
      keybindings: [{ key: 'Mod+P', when: 'global' }]
    }

    const catalog = buildShortcutDefinitionCatalog({
      disabledTuiAgents: [],
      pluginCommands: [command],
      keybindings: {},
      platform: 'darwin'
    })

    expect(catalog.conflictByAction.get('plugin:orca-samples.tasks/open')).toEqual([
      expect.stringContaining('Go to File')
    ])
  })

  it('reports a built-in shortcut that conflicts with a Quick Command', () => {
    const catalog = buildShortcutDefinitionCatalog({
      disabledTuiAgents: [],
      pluginCommands: [],
      keybindings: {},
      terminalQuickCommands: [
        {
          id: 'source-control',
          label: 'Source control command',
          action: 'terminal-command',
          command: 'git status',
          appendEnter: true,
          scope: { type: 'global' },
          keybinding: 'Mod+Shift+G'
        }
      ],
      platform: 'darwin'
    })

    expect(catalog.conflictByAction.get('sidebar.sourceControl.toggle')).toEqual([
      expect.stringContaining('Source control command')
    ])
  })

  it('reports a plugin shortcut that conflicts with a Quick Command', () => {
    const command: ActivePluginCommand = {
      pluginKey: 'orca-samples.tasks',
      pluginName: 'Tasks',
      id: 'open',
      title: 'Open Tasks',
      context: 'global',
      handler: { type: 'built-in', action: 'view.tasks' },
      keybindings: [{ key: 'Mod+Alt+T', when: 'global' }]
    }
    const catalog = buildShortcutDefinitionCatalog({
      disabledTuiAgents: [],
      pluginCommands: [command],
      keybindings: {},
      terminalQuickCommands: [
        {
          id: 'tasks',
          label: 'Tasks command',
          action: 'terminal-command',
          command: 'pnpm test',
          appendEnter: true,
          keybinding: 'Mod+Alt+T'
        }
      ],
      platform: 'darwin'
    })

    expect(catalog.conflictByAction.get('plugin:orca-samples.tasks/open')).toEqual([
      expect.stringContaining('Tasks command')
    ])
  })

  it('detects the Quick Command collision produced by resetting a built-in', () => {
    const terminalQuickCommands = [
      {
        id: 'source-control',
        label: 'Source control command',
        action: 'terminal-command' as const,
        command: 'git status',
        appendEnter: true,
        keybinding: 'Mod+Shift+G'
      }
    ]
    const customized = buildShortcutDefinitionCatalog({
      disabledTuiAgents: [],
      pluginCommands: [],
      keybindings: { 'sidebar.sourceControl.toggle': ['Mod+Alt+G'] },
      terminalQuickCommands,
      platform: 'darwin'
    })
    const reset = buildShortcutDefinitionCatalog({
      disabledTuiAgents: [],
      pluginCommands: [],
      keybindings: {},
      terminalQuickCommands,
      platform: 'darwin'
    })

    expect(customized.conflictByAction.get('sidebar.sourceControl.toggle')).toBeUndefined()
    expect(reset.conflictByAction.get('sidebar.sourceControl.toggle')).toEqual([
      expect.stringContaining('Source control command')
    ])
  })
})
