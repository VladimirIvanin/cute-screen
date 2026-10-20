import type { EditorCommand } from '@cute-screen/editor-renderer'
/** All creation entry points, including multi-layer paste, honor the active space. */
export function commandInSpace(
  command: EditorCommand,
  space: 'content' | 'card',
): EditorCommand {
  if (command.type === 'batch') return { ...command, commands: command.commands.map((c) => commandInSpace(c, space)) }
  if (command.type !== 'addLayer') return command
  if (space === 'card') return { ...command, layer: { ...command.layer, space } }
  if (command.layer.space === undefined) return command
  const { space: previous, ...layer } = command.layer
  void previous
  return { ...command, layer }
}
