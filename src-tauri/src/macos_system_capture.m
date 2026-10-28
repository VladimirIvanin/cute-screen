#import "macos_desktop_capture.h"
#import <ImageIO/ImageIO.h>
#include <signal.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

extern bool cute_screen_capture_access(bool request);
enum { CuteSystemOK = 0, CuteSystemCancelled = 1, CuteSystemDenied = 2,
       CuteSystemFailed = 3, CuteSystemInvalid = 4, CuteSystemTimedOut = 5,
       CuteSystemLaunchFailed = 6 };

int32_t cute_macos_desktop_backend_for_version(int32_t major, int32_t minor, int32_t sdk) {
  (void)major; (void)minor; (void)sdk;
  return 3;
}
int32_t cute_macos_pixel_backend(void) { return 3; }

static BOOL CuteSystemCancelledNow(const void *context, CuteWindowCancellationProbe probe) {
  return context != NULL && probe != NULL && probe(context);
}

static int32_t CuteSystemAuthorizedResult(int32_t result, bool allowed) {
  // screencapture can exit successfully with only wallpaper when TCC denies
  // foreign windows. Success of the child process alone is not capture success.
  if ((result == CuteSystemOK || result == CuteSystemFailed) && !allowed) return CuteSystemDenied;
  return result;
}

static void CuteSystemReap(NSTask *task) {
  if (task.running) {
    [task terminate];
    NSTimeInterval deadline = NSProcessInfo.processInfo.systemUptime + 0.25;
    while (task.running && NSProcessInfo.processInfo.systemUptime < deadline) usleep(5000);
    if (task.running) kill(task.processIdentifier, SIGKILL);
  }
  [task waitUntilExit];
}

static int32_t CuteSystemRun(NSTask *task, NSTimeInterval deadline,
                             const void *context, CuteWindowCancellationProbe probe) {
  if (CuteSystemCancelledNow(context, probe)) return CuteSystemCancelled;
  NSError *error = nil;
  if (![task launchAndReturnError:&error]) {
    NSLog(@"Cute Screen screenshot helper launch: %@", error);
    return CuteSystemLaunchFailed;
  }
  @try {
    while (task.running) {
      if (CuteSystemCancelledNow(context, probe)) return CuteSystemCancelled;
      if (NSProcessInfo.processInfo.systemUptime >= deadline) return CuteSystemTimedOut;
      if (NSThread.isMainThread) {
        [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.005]];
      } else {
        usleep(5000);
      }
    }
    if (CuteSystemCancelledNow(context, probe)) return CuteSystemCancelled;
    return task.terminationStatus == 0 ? CuteSystemOK : CuteSystemFailed;
  } @finally {
    CuteSystemReap(task);
  }
}

static NSArray *CuteSystemLayout(CGRect expectedBounds) {
  CGDirectDisplayID ids[32];
  uint32_t count = 0;
  if (CGGetActiveDisplayList(32, ids, &count) != kCGErrorSuccess || count == 0 || count >= 32) return nil;
  NSMutableArray *layout = [NSMutableArray array];
  CGRect bounds = CGRectNull;
  for (uint32_t index = 0; index < count; index++) {
    CGRect display = CGDisplayBounds(ids[index]);
    CGDisplayModeRef mode = CGDisplayCopyDisplayMode(ids[index]);
    if (mode == NULL) return nil;
    [layout addObject:@[@(ids[index]), [NSValue valueWithRect:NSRectFromCGRect(display)],
        @(CGDisplayModeGetPixelWidth(mode)), @(CGDisplayModeGetPixelHeight(mode))]];
    CGDisplayModeRelease(mode);
    bounds = CGRectIsNull(bounds) ? display : CGRectUnion(bounds, display);
  }
  return CGRectEqualToRect(bounds, expectedBounds) ? layout : nil;
}

CGImageRef CuteCreateDesktopImage(CGRect bounds, const void *context,
                                  CuteWindowCancellationProbe probe, int32_t *status) {
  @autoreleasepool {
    *status = CuteSystemFailed;
    if (CuteSystemCancelledNow(context, probe)) { *status = CuteSystemCancelled; return NULL; }
    if (CGRectIsNull(bounds) || CGRectIsEmpty(bounds) || !isfinite(bounds.origin.x) ||
        !isfinite(bounds.origin.y) || !isfinite(bounds.size.width) || !isfinite(bounds.size.height)) {
      *status = CuteSystemInvalid;
      return NULL;
    }
    // Request on AppKit's main queue, but do not veto the helper on preflight.
    // The OS still owns authorization; an actual helper failure is classified below.
    (void)cute_screen_capture_access(true);
    if (CuteSystemCancelledNow(context, probe)) { *status = CuteSystemCancelled; return NULL; }
    NSArray *layout = CuteSystemLayout(bounds);
    if (layout == nil) { *status = CuteSystemInvalid; return NULL; }
    NSFileManager *files = NSFileManager.defaultManager;
    NSURL *directory = [files.temporaryDirectory URLByAppendingPathComponent:
        [@"cute-screen-capture-" stringByAppendingString:NSUUID.UUID.UUIDString] isDirectory:YES];
    NSError *error = nil;
    if (![files createDirectoryAtURL:directory withIntermediateDirectories:NO
        attributes:@{NSFilePosixPermissions: @0700} error:&error]) {
      NSLog(@"Cute Screen screenshot directory: %@", error);
      return NULL;
    }
    @try {
      NSURL *output = [directory URLByAppendingPathComponent:@"capture.png"];
      NSTask *task = [[NSTask alloc] init];
      task.executableURL = [NSURL fileURLWithPath:@"/usr/sbin/screencapture"];
      task.arguments = @[@"-x", @"-t", @"png", [NSString stringWithFormat:@"-R%.0f,%.0f,%.0f,%.0f",
          bounds.origin.x, bounds.origin.y, bounds.size.width, bounds.size.height], output.path];
      task.standardOutput = NSFileHandle.fileHandleWithNullDevice;
      NSPipe *errors = [NSPipe pipe];
      task.standardError = errors;
      *status = CuteSystemRun(task, NSProcessInfo.processInfo.systemUptime + 10, context, probe);
      if (*status == CuteSystemOK || *status == CuteSystemFailed) {
        *status = CuteSystemAuthorizedResult(*status, cute_screen_capture_access(false));
      }
      if (*status != CuteSystemOK) {
        if (*status == CuteSystemFailed) {
          NSData *diagnostic = [errors.fileHandleForReading readDataOfLength:4096];
          NSLog(@"Cute Screen screenshot helper: %@", [[NSString alloc] initWithData:diagnostic encoding:NSUTF8StringEncoding]);
        } else if (*status != CuteSystemCancelled && *status != CuteSystemDenied) {
          *status = CuteSystemFailed;
        }
        return NULL;
      }
      if (![layout isEqualToArray:CuteSystemLayout(bounds)]) { *status = CuteSystemInvalid; return NULL; }
      CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)output, NULL);
      CGImageRef image = source != NULL ? CGImageSourceCreateImageAtIndex(source, 0,
          (__bridge CFDictionaryRef)@{(id)kCGImageSourceShouldCacheImmediately: @YES}) : NULL;
      if (source != NULL) CFRelease(source);
      if (image == NULL) *status = CuteSystemFailed;
      if (CuteSystemCancelledNow(context, probe)) {
        if (image != NULL) CGImageRelease(image);
        *status = CuteSystemCancelled;
        return NULL;
      }
      return image;
    } @finally {
      NSError *cleanup = nil;
      if (![files removeItemAtURL:directory error:&cleanup]) NSLog(@"Cute Screen screenshot cleanup: %@", cleanup);
    }
  }
}

int32_t cute_capture_desktop_frame(CGRect bounds, const void *context,
                                    CuteWindowCancellationProbe probe, CuteDesktopFrame *frame) {
  if (frame == NULL) return CuteSystemFailed;
  memset(frame, 0, sizeof(*frame));
  int32_t status = CuteSystemFailed;
  CGImageRef image = CuteCreateDesktopImage(bounds, context, probe, &status);
  if (image == NULL) return status;
  size_t width = CGImageGetWidth(image), height = CGImageGetHeight(image);
  if (width == 0 || height == 0 || width > UINT32_MAX || height > UINT32_MAX ||
      width > (size_t)PTRDIFF_MAX / 4 / height) { CGImageRelease(image); return CuteSystemFailed; }
  size_t len = width * height * 4;
  uint8_t *pixels = calloc(1, len);
  CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef bitmap = pixels != NULL && space != NULL ? CGBitmapContextCreate(pixels, width,
      height, 8, width * 4, space, kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little) : NULL;
  if (space != NULL) CGColorSpaceRelease(space);
  if (bitmap != NULL) {
    CGContextSetRGBFillColor(bitmap, 0, 0, 0, 1);
    CGContextFillRect(bitmap, CGRectMake(0, 0, width, height));
    CGContextDrawImage(bitmap, CGRectMake(0, 0, width, height), image);
    CGContextRelease(bitmap);
  }
  CGImageRelease(image);
  if (bitmap == NULL || CuteSystemCancelledNow(context, probe)) {
    free(pixels);
    return bitmap == NULL ? CuteSystemFailed : CuteSystemCancelled;
  }
  frame->data = pixels; frame->len = len;
  frame->width = (uint32_t)width; frame->height = (uint32_t)height;
  return CuteSystemOK;
}

void cute_release_desktop_frame(CuteDesktopFrame *frame) {
  if (frame == NULL) return;
  free(frame->data);
  memset(frame, 0, sizeof(*frame));
}

static bool CuteSystemTestCancel(const void *context) { return ++*(int *)context > 2; }
bool cute_macos_system_capture_contract(void) {
  @autoreleasepool {
    if (CuteSystemAuthorizedResult(CuteSystemOK, false) != CuteSystemDenied ||
        CuteSystemAuthorizedResult(CuteSystemOK, true) != CuteSystemOK ||
        CuteSystemAuthorizedResult(CuteSystemFailed, false) != CuteSystemDenied ||
        CuteSystemAuthorizedResult(CuteSystemFailed, true) != CuteSystemFailed ||
        CuteSystemAuthorizedResult(CuteSystemTimedOut, false) != CuteSystemTimedOut ||
        CuteSystemAuthorizedResult(CuteSystemCancelled, false) != CuteSystemCancelled) return false;
    for (int mode = 0; mode < 5; mode++) {
      NSTask *task = [[NSTask alloc] init];
      task.executableURL = [NSURL fileURLWithPath:mode == 0 ? @"/usr/bin/true" :
          mode == 1 ? @"/usr/bin/false" : mode == 4 ? @"/nonexistent/cute-screen-helper" : @"/bin/sleep"];
      task.arguments = mode >= 2 ? @[@"30"] : @[];
      int calls = 0;
      NSTimeInterval deadline = NSProcessInfo.processInfo.systemUptime + (mode == 3 ? 0.02 : 2);
      int32_t result = CuteSystemRun(task, deadline, &calls, mode == 2 ? CuteSystemTestCancel : NULL);
      int32_t expected = mode == 0 ? CuteSystemOK : mode == 2 ? CuteSystemCancelled :
          mode == 3 ? CuteSystemTimedOut : mode == 4 ? CuteSystemLaunchFailed : CuteSystemFailed;
      if (result != expected || task.running) return false;
    }
    CuteDesktopFrame frame = {malloc(4), 4, 1, 1};
    cute_release_desktop_frame(&frame); cute_release_desktop_frame(&frame);
    return frame.data == NULL && frame.len == 0 && frame.width == 0 && frame.height == 0;
  }
}
