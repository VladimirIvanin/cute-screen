#import "macos_desktop_capture.h"
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreImage/CoreImage.h>
#import <CoreMedia/CoreMedia.h>
#include <limits.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

_Static_assert(sizeof(CuteDesktopFrame) == 24, "CuteDesktopFrame size drift");
_Static_assert(offsetof(CuteDesktopFrame, data) == 0, "desktop data offset drift");
_Static_assert(offsetof(CuteDesktopFrame, len) == 8, "desktop length offset drift");
_Static_assert(offsetof(CuteDesktopFrame, width) == 16, "desktop width offset drift");
_Static_assert(offsetof(CuteDesktopFrame, height) == 20, "desktop height offset drift");

enum { CuteDesktopOK = 0, CuteDesktopCancelled = 1, CuteDesktopDenied = 2,
       CuteDesktopFailed = 3, CuteDesktopInvalid = 4 };

int32_t cute_macos_desktop_backend_for_version(int32_t major, int32_t minor, int32_t sdk) {
  if (major >= 14 && sdk >= 140000) return 2;
  if (major > 12 || (major == 12 && minor >= 3)) return 1;
  return 0;
}

int32_t cute_macos_pixel_backend(void) {
  NSOperatingSystemVersion version = NSProcessInfo.processInfo.operatingSystemVersion;
  return cute_macos_desktop_backend_for_version((int32_t)version.majorVersion,
      (int32_t)version.minorVersion, CUTE_SCREEN_MACOS_SDK);
}

static BOOL CuteDesktopCancelledNow(const void *context, CuteWindowCancellationProbe probe) {
  return context != NULL && probe != NULL && probe(context);
}

static CGContextRef CuteDesktopBitmap(size_t width, size_t height) {
  if (width == 0 || height == 0 || width > UINT32_MAX || height > UINT32_MAX ||
      width > (size_t)PTRDIFF_MAX / 4 / height) return NULL;
  CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  if (space == NULL) return NULL;
  CGContextRef bitmap = CGBitmapContextCreate(NULL, width, height, 8, width * 4, space,
      kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little);
  CGColorSpaceRelease(space);
  if (bitmap != NULL) {
    CGContextSetRGBFillColor(bitmap, 0, 0, 0, 1);
    CGContextFillRect(bitmap, CGRectMake(0, 0, width, height));
  }
  return bitmap;
}

static CGContextRef CuteDesktopScaledBitmap(CGRect bounds, CGFloat scale) {
  double width = ceil(bounds.size.width * scale), height = ceil(bounds.size.height * scale);
  if (!isfinite(width) || !isfinite(height) || width <= 0 || height <= 0 ||
      width > UINT32_MAX || height > UINT32_MAX) return NULL;
  return CuteDesktopBitmap((size_t)width, (size_t)height);
}

// Detach frames from SCK/IOSurface pools before completion handlers return.
static CGImageRef CuteDesktopCopyImage(CGImageRef image) {
  if (image == NULL) return NULL;
  size_t width = CGImageGetWidth(image), height = CGImageGetHeight(image);
  CGContextRef bitmap = CuteDesktopBitmap(width, height);
  if (bitmap == NULL) return NULL;
  CGContextDrawImage(bitmap, CGRectMake(0, 0, width, height), image);
  CGImageRef copy = CGBitmapContextCreateImage(bitmap);
  CGContextRelease(bitmap);
  return copy;
}

@interface CuteDesktopResult : NSObject
@property(nonatomic) CGImageRef image;
@property(nonatomic, strong) id content;
@property(nonatomic) int32_t status;
@property(nonatomic) BOOL finished;
@property(nonatomic, copy) NSString *stage;
@end
@implementation CuteDesktopResult
- (void)dealloc { if (_image != NULL) CGImageRelease(_image); }
@end

static void CuteDesktopFinish(CuteDesktopResult *state, CGImageRef image, int32_t status) {
  @synchronized(state) {
    if (state.finished) return;
    state.image = image != NULL ? CGImageRetain(image) : NULL;
    state.status = status;
    state.finished = YES;
  }
}

static int32_t CuteDesktopWait(CuteDesktopResult *state, const void *context,
                               CuteWindowCancellationProbe probe, NSTimeInterval deadline) {
  for (;;) {
    if (CuteDesktopCancelledNow(context, probe)) CuteDesktopFinish(state, NULL, CuteDesktopCancelled);
    @synchronized(state) { if (state.finished) return state.status; }
    if (NSProcessInfo.processInfo.systemUptime >= deadline) {
      NSLog(@"Cute Screen desktop capture timed out (%@)", state.stage ?: @"native contract");
      CuteDesktopFinish(state, NULL, CuteDesktopFailed);
      continue;
    }
    if (NSThread.isMainThread) {
      [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.005]];
    } else {
      usleep(5000);
    }
  }
}

API_AVAILABLE(macos(12.3))
static int32_t CuteDesktopError(NSError *error) {
  if ([error.domain isEqualToString:SCStreamErrorDomain] && error.code == SCStreamErrorUserDeclined) {
    return CuteDesktopDenied;
  }
  return CuteDesktopFailed;
}

API_AVAILABLE(macos(12.3))
@interface CuteDesktopStream : NSObject <SCStreamOutput, SCStreamDelegate>
@property(nonatomic, strong) CuteDesktopResult *result;
@property(nonatomic, strong) SCStream *stream;
@end
@implementation CuteDesktopStream
- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
         ofType:(SCStreamOutputType)type {
  (void)stream;
  if (type != SCStreamOutputTypeScreen || !CMSampleBufferIsValid(sampleBuffer)) return;
  @synchronized(self.result) { if (self.result.finished) return; }
  NSArray *attachments = (__bridge NSArray *)CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, false);
  NSNumber *status = attachments.firstObject[SCStreamFrameInfoStatus];
  if (status == nil || status.integerValue != SCFrameStatusComplete) return;
  CVPixelBufferRef pixels = CMSampleBufferGetImageBuffer(sampleBuffer);
  if (pixels == NULL) return;
  CIImage *image = [CIImage imageWithCVPixelBuffer:pixels];
  CGImageRef frame = [[CIContext contextWithOptions:nil] createCGImage:image fromRect:image.extent];
  CGImageRef owned = CuteDesktopCopyImage(frame);
  if (frame != NULL) CGImageRelease(frame);
  CuteDesktopFinish(self.result, owned, owned != NULL ? CuteDesktopOK : CuteDesktopFailed);
  if (owned != NULL) CGImageRelease(owned);
}
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
  (void)stream;
  NSLog(@"Cute Screen desktop stream stopped: %@", error);
  CuteDesktopFinish(self.result, NULL, CuteDesktopError(error));
}
@end

// Capture layout once and compare again before exposing any pixels. CG bounds
// use top-left logical coordinates; output uses a uniform maximum pixel scale.
static NSArray<NSDictionary *> *CuteDesktopLayout(CGRect expectedBounds) {
  uint32_t count = 0;
  if (CGGetActiveDisplayList(0, NULL, &count) != kCGErrorSuccess || count == 0) return nil;
  CGDirectDisplayID *ids = calloc(count, sizeof(*ids));
  if (ids == NULL) return nil;
  if (CGGetActiveDisplayList(count, ids, &count) != kCGErrorSuccess) { free(ids); return nil; }
  NSMutableArray<NSDictionary *> *layout = [NSMutableArray array];
  CGRect bounds = CGRectNull;
  for (uint32_t index = 0; index < count; index++) {
    CGRect display = CGDisplayBounds(ids[index]);
    CGDisplayModeRef mode = CGDisplayCopyDisplayMode(ids[index]);
    if (mode == NULL || CGRectIsEmpty(display)) {
      if (mode != NULL) CGDisplayModeRelease(mode);
      free(ids);
      return nil;
    }
    size_t logicalWidth = CGDisplayModeGetWidth(mode), logicalHeight = CGDisplayModeGetHeight(mode);
    size_t pixelWidth = CGDisplayModeGetPixelWidth(mode), pixelHeight = CGDisplayModeGetPixelHeight(mode);
    CGDisplayModeRelease(mode);
    if (logicalWidth == 0 || logicalHeight == 0 || pixelWidth == 0 || pixelHeight == 0) { free(ids); return nil; }
    // Mode backing pixels retain Retina/scaled resolution; bounds also reflect
    // display rotation, so apply the mode scale to the current oriented bounds.
    CGFloat scale = MAX((CGFloat)pixelWidth / logicalWidth, (CGFloat)pixelHeight / logicalHeight);
    double scaledWidth = ceil(display.size.width * scale), scaledHeight = ceil(display.size.height * scale);
    if (!isfinite(scaledWidth) || !isfinite(scaledHeight) ||
        scaledWidth <= 0 || scaledHeight <= 0 || scaledWidth > UINT32_MAX || scaledHeight > UINT32_MAX) {
      free(ids);
      return nil;
    }
    size_t width = (size_t)scaledWidth, height = (size_t)scaledHeight;
    bounds = CGRectIsNull(bounds) ? display : CGRectUnion(bounds, display);
    [layout addObject:@{@"id": @(ids[index]), @"bounds": [NSValue valueWithRect:NSRectFromCGRect(display)],
                       @"width": @(width), @"height": @(height)}];
  }
  free(ids);
  return CGRectEqualToRect(bounds, expectedBounds) ? layout : nil;
}

static CGRect CuteDesktopDestination(CGRect display, CGRect desktop, CGFloat scale) {
  CGFloat left = round((CGRectGetMinX(display) - CGRectGetMinX(desktop)) * scale);
  CGFloat right = round((CGRectGetMaxX(display) - CGRectGetMinX(desktop)) * scale);
  CGFloat top = round((CGRectGetMinY(display) - CGRectGetMinY(desktop)) * scale);
  CGFloat bottom = round((CGRectGetMaxY(display) - CGRectGetMinY(desktop)) * scale);
  return CGRectMake(left, ceil(desktop.size.height * scale) - bottom, right - left, bottom - top);
}

static void CuteDesktopDrawDisplay(CGContextRef bitmap, CGImageRef image, CGRect display,
                                    CGRect desktop, CGFloat scale) {
  CGContextDrawImage(bitmap, CuteDesktopDestination(display, desktop, scale), image);
}

API_AVAILABLE(macos(12.3))
static BOOL CuteDesktopStart(SCContentFilter *filter, SCStreamConfiguration *config,
                             CuteDesktopStream *request) {
#if CUTE_SDK_HAS_SCK_14
  if (@available(macOS 14.0, *)) {
    [SCScreenshotManager captureImageWithFilter:filter configuration:config
        completionHandler:^(CGImageRef image, NSError *error) {
      if (error != nil) NSLog(@"Cute Screen desktop screenshot: %@", error);
      CGImageRef owned = error == nil ? CuteDesktopCopyImage(image) : NULL;
      CuteDesktopFinish(request.result, owned, error != nil ? CuteDesktopError(error) :
          owned == NULL ? CuteDesktopFailed : CuteDesktopOK);
      if (owned != NULL) CGImageRelease(owned);
    }];
    return YES;
  }
#endif
  request.stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:request];
  NSError *error = nil;
  dispatch_queue_t queue = dispatch_queue_create("cute-screen.desktop-frame", DISPATCH_QUEUE_SERIAL);
  if (![request.stream addStreamOutput:request type:SCStreamOutputTypeScreen sampleHandlerQueue:queue error:&error]) {
    NSLog(@"Cute Screen desktop stream output: %@", error);
    CuteDesktopFinish(request.result, NULL, CuteDesktopError(error));
    request.stream = nil;
    return NO;
  }
  [request.stream startCaptureWithCompletionHandler:^(NSError *error) {
    if (error != nil) {
      NSLog(@"Cute Screen desktop stream start: %@", error);
      CuteDesktopFinish(request.result, NULL, CuteDesktopError(error));
    }
  }];
  return YES;
}

API_AVAILABLE(macos(12.3))
static BOOL CuteDesktopStop(NSArray<CuteDesktopStream *> *requests) {
  NSMutableArray<CuteDesktopResult *> *stops = [NSMutableArray array];
  // Mark every result terminal before stopping, so late frames are discarded.
  for (CuteDesktopStream *request in requests) {
    CuteDesktopFinish(request.result, NULL, CuteDesktopCancelled);
    if (request.stream == nil) continue;
    CuteDesktopResult *stopped = [[CuteDesktopResult alloc] init];
    stopped.stage = @"stopCapture";
    [stops addObject:stopped];
    [request.stream stopCaptureWithCompletionHandler:^(NSError *error) {
      if (error != nil) NSLog(@"Cute Screen desktop stream stop: %@", error);
      CuteDesktopFinish(stopped, NULL, error == nil ? CuteDesktopOK : CuteDesktopFailed);
    }];
  }
  BOOL success = YES;
  NSTimeInterval deadline = NSProcessInfo.processInfo.systemUptime + 2;
  for (CuteDesktopResult *stopped in stops) {
    if (CuteDesktopWait(stopped, NULL, NULL, deadline) != CuteDesktopOK) success = NO;
  }
  for (CuteDesktopStream *request in requests) {
    if (request.stream == nil) continue;
    NSError *error = nil;
    if (![request.stream removeStreamOutput:request type:SCStreamOutputTypeScreen error:&error]) {
      NSLog(@"Cute Screen desktop stream cleanup: %@", error);
      success = NO;
    }
    request.stream = nil;
  }
  return success;
}

API_AVAILABLE(macos(12.3))
static NSArray<NSWindow *> *CuteDesktopMontereyExclusions(void) {
  if (@available(macOS 13.0, *)) return @[];
  __block NSArray<NSWindow *> *windows = nil;
  void (^create)(void) = ^{
    NSMutableArray<NSWindow *> *created = [NSMutableArray array];
    for (NSScreen *screen in NSScreen.screens) {
      NSRect frame = NSMakeRect(NSMinX(screen.frame), NSMinY(screen.frame), 1, 1);
      NSWindow *window = [[NSWindow alloc] initWithContentRect:frame
          styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
      window.releasedWhenClosed = NO;
      window.opaque = NO;
      window.backgroundColor = NSColor.clearColor;
      window.hasShadow = NO;
      window.ignoresMouseEvents = YES;
      window.level = NSScreenSaverWindowLevel;
      window.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
          NSWindowCollectionBehaviorFullScreenAuxiliary;
      [window orderFrontRegardless];
      [created addObject:window];
    }
    windows = created;
  };
  if (NSThread.isMainThread) create();
  else dispatch_sync(dispatch_get_main_queue(), create);
  return windows;
}

API_AVAILABLE(macos(12.3))
static CGImageRef CuteDesktopSCKCapture(CGRect bounds, const void *context,
                                  CuteWindowCancellationProbe probe, int32_t *status) {
  NSArray<NSDictionary *> *layout = CuteDesktopLayout(bounds);
  if (layout == nil) { *status = CuteDesktopInvalid; return NULL; }
  NSTimeInterval deadline = NSProcessInfo.processInfo.systemUptime + 10;
  CuteDesktopResult *loaded = [[CuteDesktopResult alloc] init];
  loaded.stage = @"shareableContent";
  // Hidden host windows still provide identities for the exclusion filter.
  // On Monterey an empty exclusion list can start successfully without ever
  // delivering frames; an unbundled host may also be absent from applications.
  [SCShareableContent getShareableContentExcludingDesktopWindows:NO onScreenWindowsOnly:NO
      completionHandler:^(SCShareableContent *content, NSError *error) {
    if (error != nil) NSLog(@"Cute Screen shareable displays: %@", error);
    @synchronized(loaded) {
      if (loaded.finished) return;
      loaded.content = content;
      CuteDesktopFinish(loaded, NULL, error != nil ? CuteDesktopError(error) :
          content == nil ? CuteDesktopFailed : CuteDesktopOK);
    }
  }];
  *status = CuteDesktopWait(loaded, context, probe, deadline);
  if (*status != CuteDesktopOK) return NULL;
  SCShareableContent *content = loaded.content;
  NSMutableArray<SCRunningApplication *> *excluded = [NSMutableArray array];
  for (SCRunningApplication *app in content.applications) {
    if (app.processID == NSProcessInfo.processInfo.processIdentifier) [excluded addObject:app];
  }
  __block NSMutableSet<NSNumber *> *ownWindowIDs = nil;
  void (^readOwnWindows)(void) = ^{
    ownWindowIDs = [NSMutableSet set];
    for (NSWindow *window in NSApp.windows) {
      if (window.windowNumber > 0) [ownWindowIDs addObject:@(window.windowNumber)];
    }
  };
  if (NSThread.isMainThread) readOwnWindows();
  else dispatch_sync(dispatch_get_main_queue(), readOwnWindows);
  NSMutableArray<SCWindow *> *excludedWindows = [NSMutableArray array];
  for (SCWindow *window in content.windows) {
    if ([ownWindowIDs containsObject:@(window.windowID)]) [excludedWindows addObject:window];
  }
  NSMutableArray<CuteDesktopStream *> *requests = [NSMutableArray array];
  CGFloat scale = 1;
  for (NSDictionary *entry in layout) {
    CGRect rect = [entry[@"bounds"] rectValue];
    scale = MAX(scale, MAX([entry[@"width"] doubleValue] / rect.size.width,
                           [entry[@"height"] doubleValue] / rect.size.height));
  }
  CGContextRef bitmap = CuteDesktopScaledBitmap(bounds, scale);
  if (bitmap == NULL) { *status = CuteDesktopFailed; return NULL; }
  @try {
    for (NSDictionary *entry in layout) {
      if (CuteDesktopCancelledNow(context, probe)) { *status = CuteDesktopCancelled; break; }
      SCDisplay *selected = nil;
      for (SCDisplay *display in content.displays) {
        if (display.displayID == [entry[@"id"] unsignedIntValue]) { selected = display; break; }
      }
      if (selected == nil) { *status = CuteDesktopInvalid; break; }
      SCContentFilter *filter = nil;
      if (@available(macOS 13.0, *)) {
        filter = [[SCContentFilter alloc] initWithDisplay:selected
            excludingApplications:excluded exceptingWindows:@[]];
      } else {
        if (excludedWindows.count == 0) {
          NSLog(@"Cute Screen desktop capture: missing Monterey exclusion window");
          *status = CuteDesktopFailed;
          break;
        }
        filter = [[SCContentFilter alloc] initWithDisplay:selected excludingWindows:excludedWindows];
      }
      SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
      config.width = [entry[@"width"] unsignedIntegerValue];
      config.height = [entry[@"height"] unsignedIntegerValue];
      config.pixelFormat = kCVPixelFormatType_32BGRA;
      config.colorSpaceName = kCGColorSpaceSRGB;
      config.showsCursor = NO;
      config.queueDepth = 3;
      CuteDesktopStream *request = [[CuteDesktopStream alloc] init];
      request.result = [[CuteDesktopResult alloc] init];
      request.result.stage = @"firstFrame";
      [requests addObject:request];
      if (!CuteDesktopStart(filter, config, request)) { *status = request.result.status; break; }
    }
    if (*status == CuteDesktopOK) {
      for (CuteDesktopStream *request in requests) {
        *status = CuteDesktopWait(request.result, context, probe, deadline);
        if (*status != CuteDesktopOK) break;
      }
    }
    BOOL stopped = CuteDesktopStop(requests);
    if (*status == CuteDesktopOK && !stopped) *status = CuteDesktopFailed;
    if (CuteDesktopCancelledNow(context, probe)) *status = CuteDesktopCancelled;
    if (*status == CuteDesktopOK && ![layout isEqualToArray:CuteDesktopLayout(bounds)]) *status = CuteDesktopInvalid;
    if (*status != CuteDesktopOK) return NULL;
    CGContextSetInterpolationQuality(bitmap, kCGInterpolationNone);
    for (NSUInteger index = 0; index < layout.count; index++) {
      CGImageRef image = requests[index].result.image;
      NSDictionary *entry = layout[index];
      if (image == NULL || CGImageGetWidth(image) != [entry[@"width"] unsignedIntegerValue] ||
          CGImageGetHeight(image) != [entry[@"height"] unsignedIntegerValue]) {
        *status = CuteDesktopFailed;
        return NULL;
      }
      CuteDesktopDrawDisplay(bitmap, image, [entry[@"bounds"] rectValue], bounds, scale);
    }
    CGImageRef image = CGBitmapContextCreateImage(bitmap);
    if (image == NULL) *status = CuteDesktopFailed;
    return image;
  } @finally {
    // Also releases streams if a native exception unwinds the capture setup.
    if (requests.count > 0 && requests.firstObject.stream != nil) CuteDesktopStop(requests);
    CGContextRelease(bitmap);
  }
}

API_AVAILABLE(macos(12.3))
static CGImageRef CuteDesktopSCK(CGRect bounds, const void *context,
                                  CuteWindowCancellationProbe probe, int32_t *status) {
  // Monterey can start an effectively empty exclusion filter without producing
  // frames. A transparent, noninteractive 1x1 own window on each display makes
  // the exclusion concrete while preserving the entire foreign desktop, Dock
  // and wallpaper. Hidden windows alone do not fix this OS behavior.
  NSArray<NSWindow *> *exclusions = CuteDesktopMontereyExclusions();
  @try {
    return CuteDesktopSCKCapture(bounds, context, probe, status);
  } @finally {
    void (^close)(void) = ^{
      for (NSWindow *window in exclusions) {
        [window orderOut:nil];
        [window close];
      }
    };
    if (NSThread.isMainThread) close();
    else dispatch_sync(dispatch_get_main_queue(), close);
  }
}

CGImageRef CuteCreateDesktopImage(CGRect bounds, const void *context,
                                  CuteWindowCancellationProbe probe, int32_t *status) {
  @autoreleasepool {
    *status = CuteDesktopFailed;
    if (CuteDesktopCancelledNow(context, probe)) { *status = CuteDesktopCancelled; return NULL; }
    if (CGRectIsNull(bounds) || CGRectIsEmpty(bounds)) { *status = CuteDesktopInvalid; return NULL; }
    if (cute_macos_pixel_backend() != 0) {
      if (@available(macOS 12.3, *)) return CuteDesktopSCK(bounds, context, probe, status);
      return NULL;
    }
    CGImageRef image = CGWindowListCreateImage(bounds, kCGWindowListOptionOnScreenOnly,
        kCGNullWindowID, kCGWindowImageBestResolution | kCGWindowImageShouldBeOpaque);
    *status = image != NULL ? CuteDesktopOK : CuteDesktopFailed;
    return image;
  }
}

int32_t cute_capture_desktop_frame(CGRect bounds, const void *context,
                                    CuteWindowCancellationProbe probe, CuteDesktopFrame *frame) {
  if (frame == NULL) return CuteDesktopFailed;
  memset(frame, 0, sizeof(*frame));
  int32_t status = CuteDesktopFailed;
  CGImageRef image = CuteCreateDesktopImage(bounds, context, probe, &status);
  if (image == NULL) return status;
  size_t width = CGImageGetWidth(image), height = CGImageGetHeight(image);
  CGContextRef bitmap = CuteDesktopBitmap(width, height);
  if (bitmap != NULL) CGContextDrawImage(bitmap, CGRectMake(0, 0, width, height), image);
  CGImageRelease(image);
  if (bitmap == NULL) return CuteDesktopFailed;
  if (CuteDesktopCancelledNow(context, probe)) { CGContextRelease(bitmap); return CuteDesktopCancelled; }
  size_t len = width * height * 4;
  uint8_t *pixels = malloc(len);
  if (pixels != NULL) memcpy(pixels, CGBitmapContextGetData(bitmap), len);
  CGContextRelease(bitmap);
  if (pixels == NULL) return CuteDesktopFailed;
  frame->data = pixels;
  frame->len = len;
  frame->width = (uint32_t)width;
  frame->height = (uint32_t)height;
  return CuteDesktopOK;
}

void cute_release_desktop_frame(CuteDesktopFrame *frame) {
  if (frame == NULL) return;
  free(frame->data);
  memset(frame, 0, sizeof(*frame));
}

bool cute_macos_desktop_composition_contract(void) {
  CGRect desktop = CGRectMake(-2, -2, 4, 4);
  // Raw top-down BGRA: red/green top, yellow/white bottom. The composed
  // image must preserve all four corners after detaching and upscaling.
  uint8_t pixels[] = {0, 0, 255, 255, 0, 255, 0, 255,
                      0, 255, 255, 255, 255, 255, 255, 255};
  CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGDataProviderRef provider = CGDataProviderCreateWithData(NULL, pixels, sizeof(pixels), NULL);
  CGImageRef source = space != NULL && provider != NULL ? CGImageCreate(2, 2, 8, 32, 8, space,
      kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little, provider, NULL, false,
      kCGRenderingIntentDefault) : NULL;
  CGImageRef owned = CuteDesktopCopyImage(source);
  if (source != NULL) CGImageRelease(source);
  if (provider != NULL) CGDataProviderRelease(provider);
  if (space != NULL) CGColorSpaceRelease(space);
  memset(pixels, 0, sizeof(pixels));
  CGContextRef blue = CuteDesktopBitmap(2, 2);
  CGContextRef bitmap = CuteDesktopBitmap(8, 8);
  if (owned == NULL || blue == NULL || bitmap == NULL) {
    if (owned != NULL) CGImageRelease(owned);
    if (blue != NULL) CGContextRelease(blue);
    if (bitmap != NULL) CGContextRelease(bitmap);
    return false;
  }
  CGContextSetRGBFillColor(blue, 0, 0, 1, 1);
  CGContextFillRect(blue, CGRectMake(0, 0, 2, 2));
  CGImageRef lower = CGBitmapContextCreateImage(blue);
  CGContextRelease(blue);
  if (lower == NULL) { CGImageRelease(owned); CGContextRelease(bitmap); return false; }
  CGContextSetInterpolationQuality(bitmap, kCGInterpolationNone);
  CuteDesktopDrawDisplay(bitmap, owned, CGRectMake(-2, -2, 2, 2), desktop, 2);
  CuteDesktopDrawDisplay(bitmap, lower, CGRectMake(0, 0, 2, 2), desktop, 2);
  CGImageRelease(owned);
  CGImageRelease(lower);
  CGImageRef image = CGBitmapContextCreateImage(bitmap);
  CGImageRef copy = CuteDesktopCopyImage(image);
  CGContextRelease(bitmap);
  if (image != NULL) CGImageRelease(image);
  if (copy == NULL) return false;
  CFDataRef data = CGDataProviderCopyData(CGImageGetDataProvider(copy));
  const UInt8 *bytes = data != NULL ? CFDataGetBytePtr(data) : NULL;
  BOOL valid = bytes != NULL && CFDataGetLength(data) >= 256 &&
      bytes[0] == 0 && bytes[2] == 255 && bytes[3] == 255 &&
      bytes[12] == 0 && bytes[13] == 255 && bytes[14] == 0 &&
      bytes[96] == 0 && bytes[97] == 255 && bytes[98] == 255 &&
      bytes[108] == 255 && bytes[109] == 255 && bytes[110] == 255 &&
      bytes[144] == 255 && bytes[145] == 0 && bytes[146] == 0 &&
      bytes[28] == 0 && bytes[29] == 0 && bytes[30] == 0 && bytes[31] == 255 &&
      bytes[224] == 0 && bytes[225] == 0 && bytes[226] == 0 && bytes[227] == 255;
  if (data != NULL) CFRelease(data);
  CGImageRelease(copy);
  return valid;
}

static bool CuteDesktopTestCancelled(const void *context) {
  return *(const bool *)context;
}

bool cute_macos_desktop_wait_contract(void) {
  @autoreleasepool {
    bool cancelled = true;
    CuteDesktopResult *pending = [[CuteDesktopResult alloc] init];
    if (CuteDesktopWait(pending, &cancelled, CuteDesktopTestCancelled,
        NSProcessInfo.processInfo.systemUptime + 1) != CuteDesktopCancelled) return false;
    // A callback after the synchronous waiter returns must not change its outcome.
    CuteDesktopFinish(pending, NULL, CuteDesktopDenied);
    if (pending.status != CuteDesktopCancelled) return false;
    CuteDesktopResult *expired = [[CuteDesktopResult alloc] init];
    if (CuteDesktopWait(expired, NULL, NULL, 0) != CuteDesktopFailed) return false;
    CuteDesktopFinish(expired, NULL, CuteDesktopOK);
    if (expired.status != CuteDesktopFailed) return false;
    CuteDesktopFrame frame = {malloc(4), 4, 1, 1};
    if (frame.data == NULL) return false;
    cute_release_desktop_frame(&frame);
    cute_release_desktop_frame(&frame);
    if (frame.data != NULL || frame.len != 0 || frame.width != 0 || frame.height != 0) return false;
    if (@available(macOS 12.3, *)) {
      NSError *denied = [NSError errorWithDomain:SCStreamErrorDomain code:SCStreamErrorUserDeclined userInfo:nil];
      NSError *technical = [NSError errorWithDomain:NSPOSIXErrorDomain code:1 userInfo:nil];
      if (CuteDesktopError(denied) != CuteDesktopDenied ||
          CuteDesktopError(technical) != CuteDesktopFailed) return false;
    }
    return true;
  }
}
