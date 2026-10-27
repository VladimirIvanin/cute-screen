#import <AppKit/AppKit.h>
#include <stdbool.h>

// Smoke runs capture on a worker exactly like Tauri. Keep a real AppKit event
// loop on the main thread, including while permission and selector callbacks run.
void cute_smoke_run_appkit(const void *context, bool (*finished)(const void *)) {
  @autoreleasepool {
    [NSApplication sharedApplication];
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
