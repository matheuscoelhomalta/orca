import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  formatKeybinding,
  isDoubleTapBinding,
  keybindingFromInput,
  type KeybindingInput
} from '../../../../shared/keybindings'
import {
  ModifierDoubleTapDetector,
  modifierFromKeyEvent,
  toModifierDoubleTapEvent
} from '../../../../shared/modifier-double-tap-detector'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type TerminalQuickCommandShortcutRecorderProps = {
  binding?: string
  platform: NodeJS.Platform
  error?: string | null
  onChange: (binding: string | undefined) => void
  onValidationError: (error: string | null) => void
}

export function TerminalQuickCommandShortcutRecorder({
  binding,
  platform,
  error,
  onChange,
  onValidationError
}: TerminalQuickCommandShortcutRecorderProps): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const detectorRef = useRef(new ModifierDoubleTapDetector())

  useEffect(() => {
    window.api?.ui?.setShortcutRecorderFocused?.(recording)
    if (recording) {
      buttonRef.current?.focus()
    } else {
      detectorRef.current.reset()
    }
    return () => window.api?.ui?.setShortcutRecorderFocused?.(false)
  }, [recording])

  const capture = (input: KeybindingInput): void => {
    const result = keybindingFromInput(input, platform)
    if (!result.ok) {
      onValidationError(result.error)
      return
    }
    onValidationError(null)
    onChange(result.value)
    setRecording(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onValidationError(null)
        setRecording(true)
      }
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      detectorRef.current.reset()
      onValidationError(null)
      setRecording(false)
      return
    }
    if (modifierFromKeyEvent(event.code, event.key) !== null) {
      const detected = detectorRef.current.process(
        toModifierDoubleTapEvent({
          type: 'keyDown',
          code: event.code,
          key: event.key,
          shift: event.shiftKey,
          control: event.ctrlKey,
          alt: event.altKey,
          meta: event.metaKey,
          isAutoRepeat: event.repeat
        }),
        Date.now()
      )
      if (detected) {
        detectorRef.current.reset()
        capture({ doubleTapModifier: detected.modifier })
      }
      return
    }
    detectorRef.current.reset()
    capture({
      key: event.key,
      code: event.code,
      alt: event.altKey,
      meta: event.metaKey,
      control: event.ctrlKey,
      shift: event.shiftKey
    })
  }

  const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    detectorRef.current.process(
      toModifierDoubleTapEvent({
        type: 'keyUp',
        code: event.code,
        key: event.key,
        shift: event.shiftKey,
        control: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey
      }),
      Date.now()
    )
  }

  const label = recording
    ? translate(
        'auto.components.terminal.quick.commands.TerminalQuickCommandShortcutRecorder.listening',
        'Press shortcut keys. Escape cancels.'
      )
    : binding
      ? translate(
          'auto.components.terminal.quick.commands.TerminalQuickCommandShortcutRecorder.change',
          'Change Quick Command shortcut'
        )
      : translate(
          'auto.components.terminal.quick.commands.TerminalQuickCommandShortcutRecorder.record',
          'Record Quick Command shortcut'
        )

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          ref={buttonRef}
          type="button"
          aria-label={label}
          aria-pressed={recording}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'quick-command-shortcut-error' : undefined}
          data-shortcut-recorder=""
          data-shortcut-recorder-active={recording ? '' : undefined}
          onClick={() => {
            if (!recording) {
              onValidationError(null)
              setRecording(true)
            }
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={() => detectorRef.current.reset()}
          className={cn(
            'flex min-h-9 min-w-40 flex-1 items-center justify-center rounded-md border px-3 py-1.5 text-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
            recording
              ? 'border-ring bg-accent text-accent-foreground ring-[3px] ring-ring/30'
              : 'border-input bg-background hover:bg-accent/50'
          )}
        >
          {recording || !binding ? (
            <span className="text-muted-foreground">
              {recording
                ? translate(
                    'auto.components.terminal.quick.commands.TerminalQuickCommandShortcutRecorder.pressKeys',
                    'Press keys…'
                  )
                : translate(
                    'auto.components.terminal.quick.commands.TerminalQuickCommandShortcutRecorder.recordAction',
                    'Record shortcut'
                  )}
            </span>
          ) : (
            <ShortcutKeyCombo
              keys={formatKeybinding(binding, platform)}
              doubleTap={isDoubleTapBinding(binding)}
            />
          )}
        </button>
        {binding ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={translate(
              'auto.components.terminal.quick.commands.TerminalQuickCommandShortcutRecorder.clear',
              'Clear Quick Command shortcut'
            )}
            onClick={() => {
              onValidationError(null)
              onChange(undefined)
              setRecording(false)
              buttonRef.current?.focus()
            }}
          >
            <Trash2 />
          </Button>
        ) : null}
      </div>
      {error ? (
        <p
          id="quick-command-shortcut-error"
          role="status"
          aria-live="polite"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
