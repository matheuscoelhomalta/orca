import type { TerminalQuickCommand } from '../../../../shared/types'
import {
  buildTerminalQuickCommandInput,
  flattenTerminalQuickCommand,
  isTerminalAgentQuickCommand,
  shouldOpenTerminalQuickCommandInBackground
} from '../../../../shared/terminal-quick-commands'
import { recordTerminalUserInputForLeaf } from './terminal-input-activity'
import type { PaneCwdMap } from './resolve-split-cwd'

type QuickCommandPane = {
  leafId: string
  terminal: {
    focus: () => void
  }
}

type QuickCommandTransport = {
  sendInput: (data: string) => boolean
}

export function shouldRunTerminalQuickCommandInNewTab(command: TerminalQuickCommand): boolean {
  return isTerminalAgentQuickCommand(command) || shouldOpenTerminalQuickCommandInBackground(command)
}

export function resolveTerminalQuickCommandInitialCwd(
  paneId: number | null,
  paneCwdMap: PaneCwdMap,
  fallbackCwd: string
): string {
  return (paneId === null ? null : paneCwdMap.get(paneId)?.cwd) || fallbackCwd
}

export function sendTerminalQuickCommandToPane({
  command,
  pane,
  tabId,
  transport
}: {
  command: TerminalQuickCommand
  pane: QuickCommandPane
  tabId: string
  transport: QuickCommandTransport | null | undefined
}): boolean {
  if (isTerminalAgentQuickCommand(command)) {
    return false
  }
  if (!transport) {
    return false
  }

  const sent = transport.sendInput(
    buildTerminalQuickCommandInput(flattenTerminalQuickCommand(command))
  )
  if (sent) {
    recordTerminalUserInputForLeaf(tabId, pane.leafId)
    pane.terminal.focus()
  }
  return sent
}
