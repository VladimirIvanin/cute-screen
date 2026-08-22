import type { GlobalThemeOverrides } from 'naive-ui'

/**
 * The semantic contract is intentionally owned by Cute Screen.  Naive UI only
 * consumes this mapping, so changing the component library does not leak into
 * editor state or renderer code.
 */
export const cuteScreenThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#d14b7c',
    primaryColorHover: '#b93b69',
    primaryColorPressed: '#a52f5a',
    primaryColorSuppl: '#d14b7c',
    infoColor: '#537cda',
    errorColor: '#c93f52',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontFamily:
      "Roboto, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: '13px',
  },
  Button: {
    borderRadiusSmall: '7px',
    borderRadiusMedium: '8px',
    fontWeight: '600',
  },
  Input: {
    borderRadius: '7px',
  },
  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '7px',
      },
    },
  },
  Popover: {
    borderRadius: '12px',
    padding: '0',
  },
  Tooltip: {
    peers: {
      Popover: {
        padding: '6px 10px',
      },
    },
  },
}
