import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import {
  formatKeybindingConflictWithQuickCommand,
  formatQuickCommandKeybindingConflict,
  getReservedQuickCommandKeybindings
} from './quick-command-keybinding-conflict-copy'

const TEST_LOCALE = 'quick-command-conflict-test'

beforeEach(async () => {
  i18n.addResourceBundle(
    TEST_LOCALE,
    'translation',
    {
      auto: {
        lib: {
          quickCommandKeybindingConflictCopy: {
            reserved: { saveDialog: 'Diálogo de guardar' },
            conflictsWithOwner: '{{binding}} entra en conflicto con {{owner}}.',
            conflictsWithQuickCommand:
              '{{binding}} entra en conflicto con el comando rápido «{{command}}».'
          }
        }
      }
    },
    true,
    true
  )
  await i18n.changeLanguage(TEST_LOCALE)
})

afterEach(async () => {
  await i18n.changeLanguage('en')
  i18n.removeResourceBundle(TEST_LOCALE, 'translation')
})

describe('Quick Command keybinding conflict copy', () => {
  it('localizes the reserved save-dialog owner and complete conflict sentence', () => {
    const [reserved] = getReservedQuickCommandKeybindings()

    expect(reserved).toEqual({ binding: 'Mod+Enter', label: 'Diálogo de guardar' })
    expect(
      formatQuickCommandKeybindingConflict(
        {
          binding: 'Mod+Enter',
          ownerId: 'Mod+Enter',
          ownerLabel: reserved!.label,
          ownerType: 'reserved'
        },
        'darwin'
      )
    ).toBe('⌘Enter entra en conflicto con Diálogo de guardar.')
  })

  it('localizes the Shortcuts settings conflict around a user command label', () => {
    expect(
      formatKeybindingConflictWithQuickCommand(
        {
          binding: 'Mod+Shift+G',
          ownerId: 'status',
          ownerLabel: 'Git status',
          ownerType: 'quick-command'
        },
        'darwin'
      )
    ).toBe('⌘⇧G entra en conflicto con el comando rápido «Git status».')
  })
})
