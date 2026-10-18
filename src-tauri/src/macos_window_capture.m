#import "macos_window_capture.h"
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreImage/CoreImage.h>
#import <CoreMedia/CoreMedia.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <stdatomic.h>

static atomic_bool CuteWindowRussian = false;
void cute_window_selector_set_locale(bool russian) { atomic_store(&CuteWindowRussian, russian); }
bool CuteWindowSelectorRussian(void) { return atomic_load(&CuteWindowRussian); }

static BOOL CuteWindowCancelled(const void *context, CuteWindowCancellationProbe probe) {
  return context != NULL && probe != NULL && probe(context);
}

// Callbacks retain this object, never the Rust cancellation context/output
// record. Synchronization also covers late frames after timeout/cancellation.
@interface CuteWindowImageState : NSObject
@property(nonatomic) CGImageRef image;
@property(nonatomic) NSInteger status;
@property(nonatomic) BOOL finished;
- (void)cancelCapture:(id)sender;
@end
@implementation CuteWindowImageState
- (void)dealloc { if (_image != NULL) CGImageRelease(_image); }
- (void)cancelCapture:(id)sender {
  (void)sender;
  @synchronized(self) {
    if (self.finished) return;
    self.status = 1;
    self.finished = YES;
  }
}
@end

static NSPanel *CuteWindowProgress(CuteWindowImageState *state) {
  __block NSPanel *panel = nil;
  void (^show)(void) = ^{
    NSPoint pointer = NSEvent.mouseLocation;
    NSScreen *screen = NSScreen.mainScreen;
    for (NSScreen *candidate in NSScreen.screens) {
      if (NSPointInRect(pointer, candidate.frame)) { screen = candidate; break; }
    }
    NSRect frame = NSMakeRect(pointer.x + 20, pointer.y - 80, 310, 64);
    frame.origin.x = MAX(NSMinX(screen.frame) + 8, MIN(frame.origin.x, NSMaxX(screen.frame) - 318));
    frame.origin.y = MAX(NSMinY(screen.frame) + 8, MIN(frame.origin.y, NSMaxY(screen.frame) - 72));
    panel = [[NSPanel alloc] initWithContentRect:frame styleMask:NSWindowStyleMaskNonactivatingPanel | NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    panel.level = NSFloatingWindowLevel;
    panel.releasedWhenClosed = NO;
    NSTextField *label = [NSTextField labelWithString:CuteWindowSelectorRussian() ? @"Снимаем окно…" : @"Capturing window…"];
    label.frame = NSMakeRect(12, 22, 185, 22);
    [panel.contentView addSubview:label];
    NSButton *cancel = [NSButton buttonWithTitle:CuteWindowSelectorRussian() ? @"Отмена" : @"Cancel" target:state action:@selector(cancelCapture:)];
    cancel.frame = NSMakeRect(205, 16, 92, 32);
    [panel.contentView addSubview:cancel];
    [panel orderFrontRegardless];
  };
  if (NSThread.isMainThread) show(); else dispatch_sync(dispatch_get_main_queue(), show);
  return panel;
}

static void CuteWindowFinish(CuteWindowImageState *state, CGImageRef image, NSInteger status) {
  @synchronized(state) {
    if (state.finished) return;
    state.image = image != NULL ? CGImageRetain(image) : NULL;
    state.status = status;
    state.finished = YES;
  }
}

static BOOL CuteWindowWait(CuteWindowImageState *state, const void *context,
                           CuteWindowCancellationProbe probe, BOOL userSelection) {
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:5];
  NSDate *started = NSDate.date;
  NSPanel *progress = nil;
  @try {
  for (;;) {
    @synchronized(state) { if (state.finished) return state.status == 0; }
    if (CuteWindowCancelled(context, probe)) { CuteWindowFinish(state, NULL, 1); return NO; }
    if (!userSelection && deadline.timeIntervalSinceNow <= 0) { CuteWindowFinish(state, NULL, 3); return NO; }
    if (!userSelection && progress == nil && -started.timeIntervalSinceNow > 0.25) progress = CuteWindowProgress(state);
    if (NSThread.isMainThread) {
      NSEvent *event = [NSApp nextEventMatchingMask:NSEventMaskAny
                                        untilDate:[NSDate dateWithTimeIntervalSinceNow:0.01]
                                           inMode:NSDefaultRunLoopMode dequeue:YES];
      if (event != nil) [NSApp sendEvent:event];
      [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.001]];
    } else {
      [NSThread sleepForTimeInterval:0.01];
    }
  }
  } @finally {
    if (progress != nil) {
      void (^close)(void) = ^{ [progress orderOut:nil]; [progress close]; };
      if (NSThread.isMainThread) close(); else dispatch_sync(dispatch_get_main_queue(), close);
    }
  }
}

static int32_t CuteWindowWrite(CuteWindowImageState *state, const char *path,
                               uint32_t *width, uint32_t *height) {
  @synchronized(state) {
    if (state.status != 0 || state.image == NULL) return (int32_t)state.status ?: 3;
    size_t w = CGImageGetWidth(state.image), h = CGImageGetHeight(state.image);
    if (w == 0 || h == 0 || w > UINT32_MAX || h > UINT32_MAX) return 3;
    NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];
    CGImageDestinationRef destination = CGImageDestinationCreateWithURL((__bridge CFURLRef)url,
        (__bridge CFStringRef)UTTypePNG.identifier, 1, NULL);
    if (destination == NULL) return 3;
    CGImageDestinationAddImage(destination, state.image, NULL);
    BOOL written = CGImageDestinationFinalize(destination);
    CFRelease(destination);
    if (!written) return 3;
    *width = (uint32_t)w;
    *height = (uint32_t)h;
    return 0;
  }
}

API_AVAILABLE(macos(12.3))
@interface CuteSingleWindowFrame : NSObject <SCStreamOutput, SCStreamDelegate>
@property(nonatomic, strong) CuteWindowImageState *state;
@end
@implementation CuteSingleWindowFrame
- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
         ofType:(SCStreamOutputType)type {
  (void)stream;
  if (type != SCStreamOutputTypeScreen || !CMSampleBufferIsValid(sampleBuffer)) return;
  NSArray *attachments = (__bridge NSArray *)CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, false);
  NSNumber *status = attachments.firstObject[SCStreamFrameInfoStatus];
  if (status == nil || status.integerValue != SCFrameStatusComplete) return;
  CVImageBufferRef buffer = CMSampleBufferGetImageBuffer(sampleBuffer);
  if (buffer == NULL) return;
  CIImage *image = [CIImage imageWithCVPixelBuffer:buffer];
  CGImageRef output = [[CIContext contextWithOptions:nil] createCGImage:image fromRect:image.extent];
  if (output != NULL) {
    CuteWindowFinish(self.state, output, 0);
    CGImageRelease(output);
  }
}
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
  (void)stream;
  NSLog(@"Cute Screen single-window stream: %@", error);
  CuteWindowFinish(self.state, NULL, 3);
}
@end

API_AVAILABLE(macos(12.3))
static int32_t CuteWindowCaptureFrame(SCContentFilter *filter, SCStreamConfiguration *config,
                                      CuteWindowImageState *state, const void *context,
                                      CuteWindowCancellationProbe probe) {
#if CUTE_SDK_HAS_SCK_14
  if (@available(macOS 14.0, *)) {
    [SCScreenshotManager captureImageWithFilter:filter configuration:config
        completionHandler:^(CGImageRef image, NSError *error) {
      if (error != nil) NSLog(@"Cute Screen window screenshot: %@", error);
      CuteWindowFinish(state, image, error != nil || image == NULL ? 3 : 0);
    }];
    CuteWindowWait(state, context, probe, NO);
    return 0;
  }
#endif
  CuteSingleWindowFrame *output = [[CuteSingleWindowFrame alloc] init];
  output.state = state;
  SCStream *stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:output];
  NSError *error = nil;
  dispatch_queue_t queue = dispatch_queue_create("cute-screen.window-frame", DISPATCH_QUEUE_SERIAL);
  if (![stream addStreamOutput:output type:SCStreamOutputTypeScreen sampleHandlerQueue:queue error:&error]) {
    NSLog(@"Cute Screen window output: %@", error);
    return 3;
  }
  [stream startCaptureWithCompletionHandler:^(NSError *error) {
    if (error != nil) { NSLog(@"Cute Screen window start: %@", error); CuteWindowFinish(state, NULL, 3); }
  }];
  CuteWindowWait(state, context, probe, NO);
  CuteWindowImageState *stopped = [[CuteWindowImageState alloc] init];
  [stream stopCaptureWithCompletionHandler:^(NSError *error) {
    if (error != nil) NSLog(@"Cute Screen window stop: %@", error);
    CuteWindowFinish(stopped, NULL, 0);
  }];
  CuteWindowWait(stopped, NULL, NULL, NO);
  if (![stream removeStreamOutput:output type:SCStreamOutputTypeScreen error:&error]) {
    NSLog(@"Cute Screen window output cleanup: %@", error);
  }
  return 0;
}

API_AVAILABLE(macos(12.3))
static int32_t CuteWindowFromFilter(SCContentFilter *filter, CGSize points, CGFloat scale,
                                    const char *path, const void *context,
                                    CuteWindowCancellationProbe probe, uint32_t *width,
                                    uint32_t *height) {
  SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
#if CUTE_SDK_HAS_SCK_14
  if (@available(macOS 14.0, *)) {
    points = filter.contentRect.size;
    scale = filter.pointPixelScale;
    config.ignoreShadowsSingleWindow = YES;
    if ([config respondsToSelector:NSSelectorFromString(@"setShouldBeOpaque:")]) {
      [config setValue:@NO forKey:@"shouldBeOpaque"];
    }
  }
#endif
  if (points.width <= 0 || points.height <= 0 || scale <= 0) return 4;
  config.width = (size_t)ceil(points.width * scale);
  config.height = (size_t)ceil(points.height * scale);
  config.showsCursor = NO;
  config.pixelFormat = kCVPixelFormatType_32BGRA;
  config.queueDepth = 3;
  if ([config respondsToSelector:NSSelectorFromString(@"setIncludeChildWindows:")]) {
    [config setValue:@NO forKey:@"includeChildWindows"];
  }
  CuteWindowImageState *state = [[CuteWindowImageState alloc] init];
  int32_t started = CuteWindowCaptureFrame(filter, config, state, context, probe);
  if (started != 0) return started;
  if (CuteWindowCancelled(context, probe)) return 1;
  return CuteWindowWrite(state, path, width, height);
}

int32_t CuteCaptureIsolatedWindow(CGWindowID windowID, pid_t owner, const char *path,
                                 const void *context, CuteWindowCancellationProbe probe,
                                 uint32_t *width, uint32_t *height) {
  if (CuteWindowCancelled(context, probe)) return 1;
  NSArray *info = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow, windowID));
  NSDictionary *window = info.firstObject;
  if (window == nil || [window[(id)kCGWindowNumber] unsignedIntValue] != windowID ||
      [window[(id)kCGWindowOwnerPID] intValue] != owner || ![window[(id)kCGWindowIsOnscreen] boolValue]) return 4;
  if (@available(macOS 12.3, *)) {
    if (NSClassFromString(@"SCShareableContent") == nil) return 3;
    CuteWindowImageState *loaded = [[CuteWindowImageState alloc] init];
    __block SCWindow *selected = nil;
    [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:YES
        completionHandler:^(SCShareableContent *content, NSError *error) {
      @synchronized(loaded) {
        if (loaded.finished) return;
        for (SCWindow *item in content.windows) {
          if (item.windowID == windowID && item.owningApplication.processID == owner) { selected = item; break; }
        }
      }
      if (error != nil) NSLog(@"Cute Screen shareable windows: %@", error);
      CuteWindowFinish(loaded, NULL, error != nil ? 3 : selected == nil ? 4 : 0);
    }];
    if (!CuteWindowWait(loaded, context, probe, NO)) return (int32_t)loaded.status;
    SCContentFilter *filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:selected];
    CGFloat scale = 1;
    for (NSScreen *screen in NSScreen.screens) {
      CGDirectDisplayID display = [screen.deviceDescription[@"NSScreenNumber"] unsignedIntValue];
      if (CGRectIntersectsRect(CGDisplayBounds(display), selected.frame)) scale = MAX(scale, screen.backingScaleFactor);
    }
    return CuteWindowFromFilter(filter, selected.frame.size, scale, path, context, probe, width, height);
  }
  CGImageRef image = CGWindowListCreateImage(CGRectNull, kCGWindowListOptionIncludingWindow,
      windowID, kCGWindowImageBoundsIgnoreFraming | kCGWindowImageBestResolution);
  if (image == NULL) return 3;
  CuteWindowImageState *state = [[CuteWindowImageState alloc] init];
  CuteWindowFinish(state, image, 0);
  CGImageRelease(image);
  if (CuteWindowCancelled(context, probe)) return 1;
  return CuteWindowWrite(state, path, width, height);
}

#if CUTE_SDK_HAS_SCK_14
API_AVAILABLE(macos(14.0))
@interface CuteSystemWindowPicker : NSObject <SCContentSharingPickerObserver>
@property(nonatomic, strong) CuteWindowImageState *state;
@property(nonatomic, strong) SCContentFilter *filter;
@end
@implementation CuteSystemWindowPicker
- (void)contentSharingPicker:(SCContentSharingPicker *)picker didUpdateWithFilter:(SCContentFilter *)filter forStream:(SCStream *)stream {
  (void)picker; (void)stream;
  @synchronized(self.state) {
    if (self.state.finished) return;
    self.filter = filter;
  }
  CuteWindowFinish(self.state, NULL, 0);
}
- (void)contentSharingPicker:(SCContentSharingPicker *)picker didCancelForStream:(SCStream *)stream {
  (void)picker; (void)stream;
  CuteWindowFinish(self.state, NULL, 1);
}
- (void)contentSharingPickerStartDidFailWithError:(NSError *)error {
  NSLog(@"Cute Screen window picker: %@", error);
  CuteWindowFinish(self.state, NULL, 3);
}
@end
#endif

bool cute_macos_system_window_picker_available(void) {
#if CUTE_SDK_HAS_SCK_14
  if (@available(macOS 14.0, *)) return NSClassFromString(@"SCContentSharingPicker") != nil;
#endif
  return false;
}

int32_t CuteCaptureSystemWindow(const char *path, const void *context,
                               CuteWindowCancellationProbe probe, uint32_t *width,
                               uint32_t *height) {
#if CUTE_SDK_HAS_SCK_14
  if (@available(macOS 14.0, *)) {
    if (!cute_macos_system_window_picker_available()) return 3;
    __block int32_t result = 3;
    void (^run)(void) = ^{
      CuteSystemWindowPicker *observer = [[CuteSystemWindowPicker alloc] init];
      observer.state = [[CuteWindowImageState alloc] init];
      SCContentSharingPicker *picker = SCContentSharingPicker.sharedPicker;
      SCContentSharingPickerConfiguration *config = [[SCContentSharingPickerConfiguration alloc] init];
      config.allowedPickerModes = SCContentSharingPickerModeSingleWindow;
      NSString *bundleID = NSBundle.mainBundle.bundleIdentifier;
      if (bundleID != nil) config.excludedBundleIDs = @[bundleID];
      picker.defaultConfiguration = config;
      [picker addObserver:observer];
      picker.active = YES;
      [picker presentPickerUsingContentStyle:SCShareableContentStyleWindow];
      BOOL selected = CuteWindowWait(observer.state, context, probe, YES);
      [picker removeObserver:observer];
      picker.active = NO;
      if (!selected || observer.filter == nil) { result = (int32_t)observer.state.status ?: 3; return; }
      result = CuteWindowFromFilter(observer.filter, CGSizeZero, 1, path, context, probe, width, height);
    };
    if (NSThread.isMainThread) run(); else dispatch_sync(dispatch_get_main_queue(), run);
    return result;
  }
#else
  (void)path;
  (void)context;
  (void)probe;
  (void)width;
  (void)height;
#endif
  return 3;
}

int32_t cute_macos_window_pixel_backend(void) {
#if CUTE_SDK_HAS_SCK_14
  if (@available(macOS 14.0, *)) return 2;
#endif
  if (@available(macOS 12.3, *)) return 1;
  return 0;
}

int32_t cute_macos_build_sdk_version(void) { return CUTE_SCREEN_MACOS_SDK; }
