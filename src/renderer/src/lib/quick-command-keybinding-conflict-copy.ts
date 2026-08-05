import { formatKeybindingList } from '../../../shared/keybindings'
import type {
  QuickCommandKeybindingConflict,
  ReservedQuickCommandKeybinding
} from '../../../shared/terminal-quick-command-keybindings'
import { translate } from '@/i18n/i18n'

export function getReservedQuickCommandKeybindings(): ReservedQuickCommandKeybinding[] {
  return [
    {
      binding: 'Mod+Enter',
      label: translate(
        'auto.lib.quickCommandKeybindingConflictCopy.reserved.saveDialog',
        'Save dialog'
      )
    }
  ]
}

export function formatQuickCommandKeybindingConflict(
  conflict: QuickCommandKeybindingConflict,
  platform: NodeJS.Platform
): string {
  return translate(
    'auto.lib.quickCommandKeybindingConflictCopy.conflictsWithOwner',
    '{{binding}} conflicts with {{owner}}.',
    {
      binding: formatKeybindingList([conflict.binding], platform),
      owner: conflict.ownerLabel
    }
  )
}

export function formatKeybindingConflictWithQuickCommand(
  conflict: QuickCommandKeybindingConflict,
  platform: NodeJS.Platform
): string {
  return translate(
    'auto.lib.quickCommandKeybindingConflictCopy.conflictsWithQuickCommand',
    '{{binding}} conflicts with Quick Command “{{command}}”.',
    {
      binding: formatKeybindingList([conflict.binding], platform),
      command: conflict.ownerLabel
    }
  )
}
