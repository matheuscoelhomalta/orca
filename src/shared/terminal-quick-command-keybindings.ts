import {
  findKeybindingActionsForBinding,
  getEffectiveKeybindingsForDefinition,
  getKeybindingConflictIdentity,
  getKeybindingDefinition,
  keybindingFromInput,
  keybindingMatchesInput,
  normalizeKeybinding,
  type KeybindingActionId,
  type KeybindingDefinition,
  type KeybindingInput,
  type KeybindingOverrides,
  type KeybindingValidationResult
} from './keybindings'
import { terminalQuickCommandMatchesRepo } from './terminal-quick-commands'
import type { TerminalQuickCommand } from './types'

const ALL_BUILT_IN_SCOPES = [
  'global',
  'tabs',
  'terminal',
  'browser',
  'editor',
  'fileExplorer',
  'composer',
  'settings'
] as const

export type ReservedQuickCommandKeybinding = {
  binding: string
  label: string
}

export type QuickCommandKeybindingConflict = {
  binding: string
  ownerId: string
  ownerLabel: string
  ownerType: 'built-in' | 'plugin' | 'quick-command' | 'reserved'
}

export type QuickCommandKeybindingResolution =
  | { status: 'matched'; command: TerminalQuickCommand }
  | { status: 'ineligible'; command: TerminalQuickCommand }
  | { status: 'none' | 'ambiguous' | 'conflicted' }

export function normalizeTerminalQuickCommandKeybinding(input: string): KeybindingValidationResult {
  return normalizeKeybinding(input.trim())
}

function canonicalBinding(command: TerminalQuickCommand): string | null {
  if (!command.keybinding) {
    return null
  }
  const normalized = normalizeKeybinding(command.keybinding)
  return normalized.ok ? normalized.value : null
}

function builtInOwner(
  binding: string,
  platform: NodeJS.Platform,
  overrides?: KeybindingOverrides,
  additionalDefinitions: readonly KeybindingDefinition[] = []
): QuickCommandKeybindingConflict | null {
  const ownerId = findKeybindingActionsForBinding(
    binding,
    platform,
    overrides,
    ALL_BUILT_IN_SCOPES
  )[0]
  if (ownerId) {
    return {
      binding,
      ownerId,
      ownerLabel: getKeybindingDefinition(ownerId)?.title ?? ownerId,
      ownerType: 'built-in'
    }
  }
  const identity = getKeybindingConflictIdentity(binding, platform)
  const dynamicOwner = additionalDefinitions.find((definition) =>
    getEffectiveKeybindingsForDefinition(definition, platform, overrides).some(
      (candidate) => getKeybindingConflictIdentity(candidate, platform) === identity
    )
  )
  return dynamicOwner
    ? {
        binding,
        ownerId: dynamicOwner.id,
        ownerLabel: dynamicOwner.title,
        ownerType: 'plugin'
      }
    : null
}

function definitionOwnsBinding(options: {
  actionId: KeybindingActionId
  binding: string
  platform: NodeJS.Platform
  overrides?: KeybindingOverrides
  additionalDefinitions?: readonly KeybindingDefinition[]
}): boolean {
  const owners = findKeybindingActionsForBinding(
    options.binding,
    options.platform,
    options.overrides,
    ALL_BUILT_IN_SCOPES
  )
  if (owners.includes(options.actionId)) {
    return true
  }
  const definition = options.additionalDefinitions?.find(
    (candidate) => candidate.id === options.actionId
  )
  const identity = getKeybindingConflictIdentity(options.binding, options.platform)
  return (
    definition?.defaultBindings !== undefined &&
    getEffectiveKeybindingsForDefinition(definition, options.platform, options.overrides).some(
      (candidate) => getKeybindingConflictIdentity(candidate, options.platform) === identity
    )
  )
}

export function findTerminalQuickCommandKeybindingConflict(options: {
  binding: string
  commands: readonly TerminalQuickCommand[]
  commandId?: string
  platform: NodeJS.Platform
  keybindings?: KeybindingOverrides
  reservedBindings?: readonly ReservedQuickCommandKeybinding[]
  additionalDefinitions?: readonly KeybindingDefinition[]
}): QuickCommandKeybindingConflict | null {
  const normalized = normalizeKeybinding(options.binding)
  if (!normalized.ok) {
    return null
  }
  const identity = getKeybindingConflictIdentity(normalized.value, options.platform)
  const builtIn = builtInOwner(
    normalized.value,
    options.platform,
    options.keybindings,
    options.additionalDefinitions ?? []
  )
  if (builtIn) {
    return builtIn
  }
  for (const reserved of options.reservedBindings ?? []) {
    const reservedBinding = normalizeKeybinding(reserved.binding)
    if (
      reservedBinding.ok &&
      getKeybindingConflictIdentity(reservedBinding.value, options.platform) === identity
    ) {
      return {
        binding: normalized.value,
        ownerId: reserved.binding,
        ownerLabel: reserved.label,
        ownerType: 'reserved'
      }
    }
  }
  for (const command of options.commands) {
    if (command.id === options.commandId) {
      continue
    }
    const candidate = canonicalBinding(command)
    if (candidate && getKeybindingConflictIdentity(candidate, options.platform) === identity) {
      return {
        binding: normalized.value,
        ownerId: command.id,
        ownerLabel: command.label || 'Untitled Quick Command',
        ownerType: 'quick-command'
      }
    }
  }
  return null
}

export function findTerminalQuickCommandConflictForAction(options: {
  actionId: KeybindingActionId
  commands: readonly TerminalQuickCommand[]
  platform: NodeJS.Platform
  keybindings?: KeybindingOverrides
  additionalDefinitions?: readonly KeybindingDefinition[]
}): QuickCommandKeybindingConflict | null {
  for (const command of options.commands) {
    const binding = canonicalBinding(command)
    if (!binding) {
      continue
    }
    if (
      definitionOwnsBinding({
        actionId: options.actionId,
        binding,
        platform: options.platform,
        overrides: options.keybindings,
        additionalDefinitions: options.additionalDefinitions
      })
    ) {
      return {
        binding,
        ownerId: command.id,
        ownerLabel: command.label || 'Untitled Quick Command',
        ownerType: 'quick-command'
      }
    }
  }
  return null
}

export function resolveTerminalQuickCommandKeybinding(options: {
  commands: readonly TerminalQuickCommand[]
  input: KeybindingInput
  platform: NodeJS.Platform
  repoId: string | null
  keybindings?: KeybindingOverrides
  reservedBindings?: readonly ReservedQuickCommandKeybinding[]
  additionalDefinitions?: readonly KeybindingDefinition[]
}): QuickCommandKeybindingResolution {
  const captured = keybindingFromInput(options.input, options.platform)
  if (!captured.ok) {
    return { status: 'none' }
  }
  const matching = options.commands.filter((command) => {
    const binding = canonicalBinding(command)
    return binding ? keybindingMatchesInput(binding, options.input, options.platform) : false
  })
  if (matching.length === 0) {
    return { status: 'none' }
  }
  if (matching.length !== 1) {
    return { status: 'ambiguous' }
  }
  const command = matching[0]!
  if (
    findTerminalQuickCommandKeybindingConflict({
      binding: captured.value,
      commands: options.commands,
      commandId: command.id,
      platform: options.platform,
      keybindings: options.keybindings,
      reservedBindings: options.reservedBindings,
      additionalDefinitions: options.additionalDefinitions
    })
  ) {
    return { status: 'conflicted' }
  }
  return terminalQuickCommandMatchesRepo(command, options.repoId)
    ? { status: 'matched', command }
    : { status: 'ineligible', command }
}

export function resolveTerminalQuickCommandById(options: {
  commands: readonly TerminalQuickCommand[]
  commandId: string
  platform: NodeJS.Platform
  repoId: string | null
  keybindings?: KeybindingOverrides
  reservedBindings?: readonly ReservedQuickCommandKeybinding[]
  additionalDefinitions?: readonly KeybindingDefinition[]
}): QuickCommandKeybindingResolution {
  const command = options.commands.find((candidate) => candidate.id === options.commandId)
  const binding = command ? canonicalBinding(command) : null
  if (!command || !binding) {
    return { status: 'none' }
  }
  const identity = getKeybindingConflictIdentity(binding, options.platform)
  const duplicateCount = options.commands.filter((candidate) => {
    const candidateBinding = canonicalBinding(candidate)
    return (
      candidateBinding !== null &&
      getKeybindingConflictIdentity(candidateBinding, options.platform) === identity
    )
  }).length
  if (duplicateCount !== 1) {
    return { status: 'ambiguous' }
  }
  if (
    findTerminalQuickCommandKeybindingConflict({
      binding,
      commands: options.commands,
      commandId: command.id,
      platform: options.platform,
      keybindings: options.keybindings,
      reservedBindings: options.reservedBindings,
      additionalDefinitions: options.additionalDefinitions
    })
  ) {
    return { status: 'conflicted' }
  }
  return terminalQuickCommandMatchesRepo(command, options.repoId)
    ? { status: 'matched', command }
    : { status: 'ineligible', command }
}
