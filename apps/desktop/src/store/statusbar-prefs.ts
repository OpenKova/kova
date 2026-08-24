import { Codecs, persistentAtom } from '@/lib/persisted'

const STATUSBAR_HIDDEN_STORAGE_KEY = 'kova.desktop.statusbarHidden'
const STATUSBAR_VISIBLE_STORAGE_KEY = 'kova.desktop.statusbarVisible'

// Whole-bar visibility, VS Code's `workbench.statusBar.visible`. On by default.
// Hiding it unmounts the bar (its 15s status poll goes with it), so the way back
// is the `view.toggleStatusbar` keybind or the ⌘K row, never the bar itself.
export const $statusbarVisible = persistentAtom(STATUSBAR_VISIBLE_STORAGE_KEY, true, Codecs.bool)

export function toggleStatusbarVisible() {
  $statusbarVisible.set(!$statusbarVisible.get())
}

// Kova ships with EVERY statusbar item visible out of the box (command-centre
// style: agents, approvals, terminal, cron, webhooks, timers, context meter).
// Users can still hide any item from the bar's context menu; their hidden set
// persists as before. Nothing is hidden by default.
export const STATUSBAR_HIDDEN_BY_DEFAULT: readonly string[] = []

// Stored as the explicit hidden set (not the visible one) so an item added to
// the bar in a later version shows up for existing users instead of silently
// staying off. An empty array is a real value — the user turned everything on —
// so this uses a sanitizing json codec rather than Codecs.stringArray, which
// drops the key when empty and would resurrect the defaults on next launch.
export const $statusbarHiddenIds = persistentAtom<string[]>(
  STATUSBAR_HIDDEN_STORAGE_KEY,
  [...STATUSBAR_HIDDEN_BY_DEFAULT],
  Codecs.json<string[]>(value =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : []
  )
)

export function setStatusbarItemVisible(id: string, visible: boolean) {
  const hidden = $statusbarHiddenIds.get()

  if (visible === !hidden.includes(id)) {
    return
  }

  $statusbarHiddenIds.set(visible ? hidden.filter(entry => entry !== id) : [...hidden, id])
}

/** Pure so the menu can derive its reset row's disabled state from the hidden
 *  list it already subscribes to, rather than reading the atom out of band.
 *  Set-compared: order is incidental (items are appended as they're hidden) and
 *  a duplicated id shouldn't read as a customization. */
export function isStatusbarLayoutDefault(hidden: readonly string[]) {
  const ids = new Set(hidden)

  return ids.size === STATUSBAR_HIDDEN_BY_DEFAULT.length && STATUSBAR_HIDDEN_BY_DEFAULT.every(id => ids.has(id))
}

/** Put the show/hide set back to what ships. Only touches item layout — whole-bar
 *  visibility is a separate preference, and resetting from the bar's own menu
 *  shouldn't make the bar the user is right-clicking disappear. */
export function resetStatusbarLayout() {
  $statusbarHiddenIds.set([...STATUSBAR_HIDDEN_BY_DEFAULT])
}
