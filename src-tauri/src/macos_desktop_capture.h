#import "macos_window_capture.h"
#include <stddef.h>
#include <stdint.h>

typedef struct {
  uint8_t *data;
  size_t len;
  uint32_t width;
  uint32_t height;
} CuteDesktopFrame;

// Returned image follows the Create rule. Callbacks retain only native state;
// the synchronous waiter is the only code allowed to inspect context/probe.
CGImageRef CuteCreateDesktopImage(CGRect bounds, const void *context,
                                  CuteWindowCancellationProbe probe, int32_t *status);
int32_t cute_capture_desktop_frame(CGRect bounds, const void *context,
                                    CuteWindowCancellationProbe probe, CuteDesktopFrame *frame);
void cute_release_desktop_frame(CuteDesktopFrame *frame);
int32_t cute_macos_pixel_backend(void);
int32_t cute_macos_desktop_backend_for_version(int32_t major, int32_t minor, int32_t sdk);
bool cute_macos_desktop_composition_contract(void);
bool cute_macos_desktop_wait_contract(void);
