import {
  ref,
  type Ref,
} from 'vue'

let collapsed = false

export function rememberQuickSettingsCollapsed(value: boolean): void {
  collapsed = value
}

export function useRememberedQuickSettingsCollapsed(): {
  quickSettingsCollapsed: Ref<boolean>
  onQuickSettingsLayout: (event: Event) => void
} {
  const quickSettingsCollapsed = ref(collapsed)
  function onQuickSettingsLayout(event: Event): void {
    const next = Boolean((event as CustomEvent<boolean>).detail)
    collapsed = next
    quickSettingsCollapsed.value = next
  }
  return { quickSettingsCollapsed, onQuickSettingsLayout }
}
