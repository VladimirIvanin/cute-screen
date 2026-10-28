#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#include <stdbool.h>

// @available checks only the running OS; symbols introduced by a newer SDK must
// also be compiled out, otherwise an older SDK fails to build. CI overrides
// CUTE_SCREEN_MACOS_SDK to syntax-check the legacy branch with a current SDK.
#ifndef CUTE_SCREEN_MACOS_SDK
#define CUTE_SCREEN_MACOS_SDK __MAC_OS_X_VERSION_MAX_ALLOWED
#endif
#ifndef CUTE_SCREEN_SCK_ENABLED
#define CUTE_SCREEN_SCK_ENABLED 0
#endif
#define CUTE_SDK_HAS_SCK_14 (CUTE_SCREEN_SCK_ENABLED && CUTE_SCREEN_MACOS_SDK >= 140000)

typedef bool (*CuteWindowCancellationProbe)(const void *context);

// Returns 0 success, 1 cancel, 2 permission denied, 3 capture failure,
// 4 target invalidated. No caller-owned pointer is retained after return.
int32_t CuteCaptureIsolatedWindow(CGWindowID windowID, pid_t owner, const char *path,
                                 const void *context, CuteWindowCancellationProbe probe,
                                 uint32_t *width, uint32_t *height);
int32_t CuteCaptureSystemWindow(const char *path, const void *context,
                               CuteWindowCancellationProbe probe, uint32_t *width,
                               uint32_t *height);
bool cute_macos_system_window_picker_available(void);
int32_t cute_macos_window_pixel_backend(void);
int32_t cute_macos_build_sdk_version(void);
void cute_window_selector_set_locale(bool russian);
bool CuteWindowSelectorRussian(void);
