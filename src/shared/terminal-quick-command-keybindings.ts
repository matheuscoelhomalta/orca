import {
  findKeybindingActionsForBinding,
  getKeybindingConflictIdentity,
  getKeybindingDefinition,
  keybindingFromInput,
  keybindingMatchesInput,
  normalizeKeybinding,
  type KeybindingActionId,
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
  ownerType: 'built-in' | 'quick-command' | 'reserved'
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
  overrides?: KeybindingOverrides
): QuickCommandKeybindingConflict | null {
  const ownerId = findKeybindingActionsForBinding(
    binding,
    platform,
    overrides,
    ALL_BUILT_IN_SCOPES
  )[0]
  if (!ownerId) {
    return null
  }
  return {
    binding,
    ownerId,
    ownerLabel: getKeybindingDefinition(ownerId)?.title ?? ownerId,
    ownerType: 'built-in'
  }
}

export function findTerminalQuickCommandKeybindingConflict(options: {
  binding: string
  commands: readonly TerminalQuickCommand[]
  commandId?: string
  platform: NodeJS.Platform
  keybindings?: KeybindingOverrides
  reservedBindings?: readonly ReservedQuickCommandKeybinding[]
}): QuickCommandKeybindingConflict | null {
  const normalized = normalizeKeybinding(options.binding)
  if (!normalized.ok) {
    return null
  }
  const identity = getKeybindingConflictIdentity(normalized.value, options.platform)
  const builtIn = builtInOwner(normalized.value, options.platform, options.keybindings)
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
}): QuickCommandKeybindingConflict | null {
  for (const command of options.commands) {
    const binding = canonicalBinding(command)
    if (!binding) {
      continue
    }
    const owners = findKeybindingActionsForBinding(
      binding,
      options.platform,
      options.keybindings,
      ALL_BUILT_IN_SCOPES
    )
    if (owners.includes(options.actionId)) {
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
      reservedBindings: options.reservedBindings
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
      reservedBindings: options.reservedBindings
    })
  ) {
    return { status: 'conflicted' }
  }
  return terminalQuickCommandMatchesRepo(command, options.repoId)
    ? { status: 'matched', command }
    : { status: 'ineligible', command }
}
