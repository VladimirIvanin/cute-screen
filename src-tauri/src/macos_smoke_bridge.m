#import <AppKit/AppKit.h>
#include <stdbool.h>
#include <stdint.h>

// Inspect WindowServer rather than the implementation's compatibility array.
uint32_t cute_smoke_onscreen_window_count(void) {
  CFArrayRef info = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID);
  if (info == NULL) return UINT32_MAX;
  uint32_t count = 0;
  for (NSDictionary *window in (__bridge NSArray *)info) {
    if ([window[(id)kCGWindowOwnerPID] intValue] == NSProcessInfo.processInfo.processIdentifier) count++;
  }
  CFRelease(info);
  return count;
}

// Smoke runs capture on a worker exactly like Tauri. Keep a real AppKit event
// loop on the main thread, including while permission and selector callbacks run.
void cute_smoke_run_appkit(const void *context, bool (*finished)(const void *)) {
  @autoreleasepool {
    [NSApplication sharedApplication];
    // Command-line AppKit defaults to Prohibited: mouse selection can work
    // while Escape is delivered to another app. Match the GUI host's policy.
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    NSTimer *timer = [NSTimer scheduledTimerWithTimeInterval:0.01 repeats:YES
        block:^(NSTimer *timer) {
      if (!finished(context)) return;
      [timer invalidate];
      [NSApp stop:nil];
      [NSApp postEvent:[NSEvent otherEventWithType:NSEventTypeApplicationDefined
          location:NSZeroPoint modifierFlags:0 timestamp:0 windowNumber:0
          context:nil subtype:0 data1:0 data2:0] atStart:NO];
    }];
    [NSApp run];
    [timer invalidate];
  }
}
