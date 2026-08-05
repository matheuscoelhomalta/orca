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
})
