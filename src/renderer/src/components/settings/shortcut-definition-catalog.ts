import {
  findKeybindingConflictsForDefinitions,
  formatKeybindingList,
  type KeybindingActionId,
  type KeybindingDefinition,
  type KeybindingOverrides
} from '../../../../shared/keybindings'
import type { TerminalQuickCommand, TuiAgent } from '../../../../shared/types'
import { findTerminalQuickCommandConflictForAction } from '../../../../shared/terminal-quick-command-keybindings'
import type { ActivePluginCommand } from '@/store/plugin-panels'
import { buildPluginCommandKeybindingDefinitions } from '@/lib/plugin-command-keybindings'
import { disabledAgentTabActionIds, groupDefinitions, type ShortcutGroup } from './shortcut-groups'

export type ShortcutDefinitionCatalog = {
  groups: ShortcutGroup[]
  definitions: KeybindingDefinition[]
  definitionsByAction: Map<KeybindingActionId, KeybindingDefinition>
  ignoredConflictActionIds: KeybindingActionId[]
  conflictByAction: Map<KeybindingActionId, string[]>
}

export function getQuickCommandConflictMessageForAction(
  actionId: KeybindingActionId,
  terminalQuickCommands: readonly TerminalQuickCommand[] | undefined,
  platform: NodeJS.Platform,
  keybindings: KeybindingOverrides,
  additionalDefinitions: readonly KeybindingDefinition[] = []
): string | null {
  const conflict = findTerminalQuickCommandConflictForAction({
    actionId,
    commands: terminalQuickCommands ?? [],
    platform,
    keybindings,
    additionalDefinitions
  })
  return conflict
    ? `${formatKeybindingList([conflict.binding], platform)} conflicts with Quick Command “${conflict.ownerLabel}”.`
    : null
}

export function buildShortcutDefinitionCatalog(options: {
  disabledTuiAgents: readonly TuiAgent[]
  pluginCommands: readonly ActivePluginCommand[]
  keybindings: KeybindingOverrides
  terminalQuickCommands?: readonly TerminalQuickCommand[]
  platform: NodeJS.Platform
}): ShortcutDefinitionCatalog {
  const pluginDefinitions = buildPluginCommandKeybindingDefinitions(options.pluginCommands)
  const groups = groupDefinitions(options.disabledTuiAgents, pluginDefinitions)
  const definitions = groups.flatMap((group) => group.items)
  const definitionsByAction = new Map(definitions.map((definition) => [definition.id, definition]))
  const ignoredConflictActionIds = disabledAgentTabActionIds(options.disabledTuiAgents)
  const conflictByAction = new Map<KeybindingActionId, string[]>()
  const conflicts = findKeybindingConflictsForDefinitions(
    definitions,
    options.platform,
    options.keybindings,
    {
      ignoredActionIds: ignoredConflictActionIds,
      // Plugin defaults are external additions to Orca's conflict-free static
      // registry, so surface their collisions even before the user customizes one.
      relevantActionIds: pluginDefinitions.map((definition) => definition.id)
    }
  )
  for (const conflict of conflicts) {
    const labels = conflict.actionIds
      .map((id) => definitionsByAction.get(id)?.title ?? id)
      .join(', ')
    for (const actionId of conflict.actionIds) {
      conflictByAction.set(actionId, [
        ...(conflictByAction.get(actionId) ?? []),
        `${formatKeybindingList([conflict.binding], options.platform)} conflicts with ${labels}.`
      ])
    }
  }
  for (const definition of definitions) {
    const quickCommandConflict = getQuickCommandConflictMessageForAction(
      definition.id,
      options.terminalQuickCommands,
      options.platform,
      options.keybindings,
      pluginDefinitions
    )
    if (!quickCommandConflict) {
      continue
    }
    conflictByAction.set(definition.id, [
      ...(conflictByAction.get(definition.id) ?? []),
      quickCommandConflict
    ])
  }
  return {
    groups,
    definitions,
    definitionsByAction,
    ignoredConflictActionIds,
    conflictByAction
  }
}
