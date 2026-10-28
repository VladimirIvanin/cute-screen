#import "macos_window_capture.h"
#include <stdatomic.h>

static atomic_bool CuteWindowRussian = false;
void cute_window_selector_set_locale(bool russian) { atomic_store(&CuteWindowRussian, russian); }
bool CuteWindowSelectorRussian(void) { return atomic_load(&CuteWindowRussian); }
bool cute_macos_system_window_picker_available(void) { return false; }
int32_t cute_macos_window_pixel_backend(void) { return 0; }
int32_t cute_macos_build_sdk_version(void) { return CUTE_SCREEN_MACOS_SDK; }

int32_t CuteCaptureIsolatedWindow(CGWindowID windowID, pid_t owner, const char *path,
                                 const void *context, CuteWindowCancellationProbe probe,
                                 uint32_t *width, uint32_t *height) {
  (void)windowID; (void)owner; (void)path; (void)width; (void)height;
  return context != NULL && probe != NULL && probe(context) ? 1 : 3;
}
int32_t CuteCaptureSystemWindow(const char *path, const void *context,
                               CuteWindowCancellationProbe probe, uint32_t *width, uint32_t *height) {
  return CuteCaptureIsolatedWindow(0, 0, path, context, probe, width, height);
}
