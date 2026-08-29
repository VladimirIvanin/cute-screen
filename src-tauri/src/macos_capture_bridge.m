#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <stdbool.h>

typedef struct {
  int32_t status;
  int32_t x;
  int32_t y;
  uint32_t width;
  uint32_t height;
  uint32_t frame_width;
  uint32_t frame_height;
} CuteCaptureSelection;

typedef struct {
  double x;
  double y;
  double width;
  double height;
} CuteRect;

typedef NS_ENUM(NSInteger, CuteCaptureMode) {
  CuteCaptureModeArea = 1,
  CuteCaptureModeWindow = 2,
};

static CuteRect CuteRectMake(double x, double y, double width, double height) {
  CuteRect rect = {x, y, width, height};
  return rect;
}

static CGRect CuteRectToCGRect(CuteRect rect) {
  return CGRectMake(rect.x, rect.y, rect.width, rect.height);
}

static CuteRect CuteRectFromCGRect(CGRect rect) {
  return CuteRectMake(rect.origin.x, rect.origin.y, rect.size.width, rect.size.height);
}

CuteRect cute_selector_window_frame(CuteRect screen_frame) { return screen_frame; }

bool cute_selector_draws_with_flipped_ctm(void) { return false; }

CuteRect cute_selector_image_rect_for_screen(CuteRect screen, CuteRect desktop,
                                             uint32_t image_width, uint32_t image_height) {
  double desktop_width = desktop.width > 0.0 ? desktop.width : 1.0;
  double desktop_height = desktop.height > 0.0 ? desktop.height : 1.0;
  double top_from_desktop_top = (desktop.y + desktop.height) - (screen.y + screen.height);
  return CuteRectMake(floor((screen.x - desktop.x) / desktop_width * (double)image_width),
                      floor(top_from_desktop_top / desktop_height * (double)image_height),
                      ceil(screen.width / desktop_width * (double)image_width),
                      ceil(screen.height / desktop_height * (double)image_height));
}

CuteRect cute_selector_pixels_from_view_rect(CuteRect selected, double view_width,
                                             double view_height, CuteRect image_rect) {
  double width = view_width > 0.0 ? view_width : 1.0;
  double height = view_height > 0.0 ? view_height : 1.0;
  return CuteRectMake(floor(image_rect.x + selected.x / width * image_rect.width),
                      floor(image_rect.y + selected.y / height * image_rect.height),
                      ceil(selected.width / width * image_rect.width),
                      ceil(selected.height / height * image_rect.height));
}

CuteRect cute_selector_view_rect_for_window_bounds(CuteRect window_bounds,
                                                   CuteRect screen_frame,
                                                   CuteRect main_screen_frame) {
  double appkit_x = window_bounds.x;
  double appkit_y = (main_screen_frame.y + main_screen_frame.height) - window_bounds.y -
                    window_bounds.height;
  return CuteRectMake(appkit_x - screen_frame.x,
                      (screen_frame.y + screen_frame.height) - (appkit_y + window_bounds.height),
                      window_bounds.width, window_bounds.height);
}

@interface CuteCaptureWindow : NSWindow
@end

@implementation CuteCaptureWindow
- (BOOL)canBecomeKeyWindow {
  return YES;
}
- (BOOL)canBecomeMainWindow {
  return YES;
}
@end

@interface CuteCaptureView : NSView
@property(nonatomic) CuteCaptureMode mode;
@property(nonatomic) CuteRect screenFrame;
@property(nonatomic) CuteRect mainScreenFrame;
@property(nonatomic) CuteRect imageRect;
@property(nonatomic) CGImageRef frozenImage;
@property(nonatomic, strong) NSImage *frozenNSImage;
@property(nonatomic, copy) NSArray<NSDictionary *> *windows;
@property(nonatomic) NSPoint dragStart;
@property(nonatomic) NSRect selection;
@property(nonatomic) BOOL dragging;
@property(nonatomic) BOOL accepted;
@property(nonatomic) BOOL cancelled;
@end

@implementation CuteCaptureView

- (BOOL)acceptsFirstResponder {
  return YES;
}

- (BOOL)isFlipped {
  return YES;
}

- (void)resetCursorRects {
  [self addCursorRect:self.bounds cursor:NSCursor.crosshairCursor];
}

- (void)setFrozenImage:(CGImageRef)frozenImage {
  if (_frozenImage == frozenImage) {
    return;
  }
  if (_frozenImage != NULL) {
    CGImageRelease(_frozenImage);
  }
  _frozenImage = frozenImage != NULL ? CGImageRetain(frozenImage) : NULL;
  self.frozenNSImage =
      _frozenImage != NULL ? [[NSImage alloc] initWithCGImage:_frozenImage size:NSZeroSize] : nil;
}

- (void)dealloc {
  if (_frozenImage != NULL) {
    CGImageRelease(_frozenImage);
  }
}

- (void)drawFrozenImageInBounds:(NSRect)bounds {
  if (self.frozenNSImage == nil) {
    return;
  }
  [self.frozenNSImage drawInRect:bounds
                        fromRect:NSZeroRect
                       operation:NSCompositingOperationCopy
                        fraction:1.0
                  respectFlipped:YES
                           hints:@{NSImageHintInterpolation : @(NSImageInterpolationNone)}];
}

- (void)drawRect:(NSRect)dirtyRect {
  (void)dirtyRect;
  NSRect bounds = self.bounds;
  [self drawFrozenImageInBounds:bounds];

  [[NSColor colorWithWhite:0 alpha:0.32] setFill];
  NSRectFillUsingOperation(bounds, NSCompositingOperationSourceOver);
  if (!NSIsEmptyRect(self.selection)) {
    [NSGraphicsContext saveGraphicsState];
    [[NSBezierPath bezierPathWithRect:self.selection] addClip];
    [self drawFrozenImageInBounds:bounds];
    [NSGraphicsContext restoreGraphicsState];

    NSBezierPath *outline = [NSBezierPath bezierPathWithRect:NSInsetRect(self.selection, 0.5, 0.5)];
    outline.lineWidth = 2.0;
    CGFloat dash[] = {7.0, 4.0};
    [outline setLineDash:dash count:2 phase:0.0];
    [NSColor.whiteColor setStroke];
    [outline stroke];
  }
}

- (NSPoint)localPointForEvent:(NSEvent *)event {
  return [self convertPoint:event.locationInWindow fromView:nil];
}

- (void)updateWindowSelection:(NSPoint)local {
  self.selection = NSZeroRect;
  CuteRect localPoint = CuteRectMake(local.x, local.y, 0.0, 0.0);
  for (NSDictionary *window in self.windows) {
    CGRect bounds = CGRectZero;
    if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds],
                                                 &bounds)) {
      continue;
    }
    CuteRect viewRect = cute_selector_view_rect_for_window_bounds(
        CuteRectFromCGRect(bounds), self.screenFrame, self.mainScreenFrame);
    if (localPoint.x >= viewRect.x && localPoint.y >= viewRect.y &&
        localPoint.x <= viewRect.x + viewRect.width &&
        localPoint.y <= viewRect.y + viewRect.height) {
      self.selection = NSMakeRect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);
      break;
    }
  }
  [self setNeedsDisplay:YES];
}

- (void)mouseMoved:(NSEvent *)event {
  if (self.mode == CuteCaptureModeWindow) {
    [self updateWindowSelection:[self localPointForEvent:event]];
  }
}

- (void)mouseDown:(NSEvent *)event {
  [self.window makeKeyAndOrderFront:nil];
  NSPoint point = [self localPointForEvent:event];
  if (self.mode == CuteCaptureModeWindow) {
    [self updateWindowSelection:point];
    if (!NSIsEmptyRect(self.selection)) {
      [self finish:YES];
    }
    return;
  }
  self.dragging = YES;
  self.dragStart = point;
  self.selection = NSZeroRect;
}

- (void)mouseDragged:(NSEvent *)event {
  if (!self.dragging || self.mode != CuteCaptureModeArea) {
    return;
  }
  NSPoint point = [self localPointForEvent:event];
  CGFloat x = MIN(self.dragStart.x, point.x);
  CGFloat y = MIN(self.dragStart.y, point.y);
  self.selection = NSIntersectionRect(
      NSMakeRect(x, y, fabs(point.x - self.dragStart.x), fabs(point.y - self.dragStart.y)),
      self.bounds);
  [self setNeedsDisplay:YES];
}

- (void)mouseUp:(NSEvent *)event {
  if (!self.dragging || self.mode != CuteCaptureModeArea) {
    return;
  }
  [self mouseDragged:event];
  self.dragging = NO;
  if (NSWidth(self.selection) >= 2.0 && NSHeight(self.selection) >= 2.0) {
    [self finish:YES];
  }
}

- (void)keyDown:(NSEvent *)event {
  if (event.keyCode == 53) {
    [self finish:NO];
    return;
  }
  [super keyDown:event];
}

- (void)finish:(BOOL)accepted {
  self.accepted = accepted;
  self.cancelled = !accepted;
}

@end

static CGRect CuteActiveDisplayBounds(void) {
  uint32_t count = 0;
  if (CGGetActiveDisplayList(0, NULL, &count) != kCGErrorSuccess || count == 0) {
    return CGRectNull;
  }
  CGDirectDisplayID *displays = calloc(count, sizeof(CGDirectDisplayID));
  if (displays == NULL) {
    return CGRectNull;
  }
  if (CGGetActiveDisplayList(count, displays, &count) != kCGErrorSuccess) {
    free(displays);
    return CGRectNull;
  }
  CGRect bounds = CGRectNull;
  for (uint32_t index = 0; index < count; index++) {
    bounds = CGRectIsNull(bounds) ? CGDisplayBounds(displays[index])
                                 : CGRectUnion(bounds, CGDisplayBounds(displays[index]));
  }
  free(displays);
  return bounds;
}

static NSArray<NSDictionary *> *CuteWindowCandidates(void) {
  NSArray<NSDictionary *> *source =
      CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly,
                                                   kCGNullWindowID));
  NSMutableArray<NSDictionary *> *result = [NSMutableArray array];
  pid_t ownPid = NSProcessInfo.processInfo.processIdentifier;
  for (NSDictionary *window in source) {
    NSNumber *ownerPid = window[(id)kCGWindowOwnerPID];
    NSNumber *layer = window[(id)kCGWindowLayer];
    NSNumber *alpha = window[(id)kCGWindowAlpha];
    NSNumber *sharing = window[(id)kCGWindowSharingState];
    CGRect bounds = CGRectZero;
    if (ownerPid.intValue == ownPid || layer.integerValue != 0 || alpha.doubleValue <= 0.01 ||
        sharing.integerValue == kCGWindowSharingNone ||
        !CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(id)kCGWindowBounds],
                                                &bounds) ||
        CGRectGetWidth(bounds) < 2.0 || CGRectGetHeight(bounds) < 2.0) {
      continue;
    }
    [result addObject:window];
  }
  return result;
}

static BOOL CuteWritePng(CGImageRef image, NSString *path) {
  NSURL *url = [NSURL fileURLWithPath:path];
  CGImageDestinationRef destination =
      CGImageDestinationCreateWithURL((__bridge CFURLRef)url,
                                      (__bridge CFStringRef)UTTypePNG.identifier, 1, NULL);
  if (destination == NULL) {
    return NO;
  }
  CGImageDestinationAddImage(destination, image, NULL);
  BOOL written = CGImageDestinationFinalize(destination);
  CFRelease(destination);
  return written;
}

static NSWindow *CuteMakeOverlayWindow(NSScreen *screen, CuteCaptureView **outView,
                                       CuteCaptureMode mode, CGImageRef frozen,
                                       CuteRect desktopFrame, CuteRect mainScreenFrame,
                                       NSArray<NSDictionary *> *windows, size_t imageWidth,
                                       size_t imageHeight) {
  CuteRect screenFrame = cute_selector_window_frame(CuteRectFromCGRect(screen.frame));
  NSRect windowFrame = CuteRectToCGRect(screenFrame);
  CuteCaptureWindow *window =
      [[CuteCaptureWindow alloc] initWithContentRect:windowFrame
                                           styleMask:NSWindowStyleMaskBorderless
                                             backing:NSBackingStoreBuffered
                                               defer:NO
                                              screen:screen];
  [window setFrame:windowFrame display:NO];
  window.level = NSScreenSaverWindowLevel;
  window.opaque = YES;
  window.hasShadow = NO;
  window.backgroundColor = NSColor.blackColor;
  window.animationBehavior = NSWindowAnimationBehaviorNone;
  window.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
                              NSWindowCollectionBehaviorFullScreenAuxiliary |
                              NSWindowCollectionBehaviorStationary;
  window.acceptsMouseMovedEvents = YES;
  window.releasedWhenClosed = NO;
  window.excludedFromWindowsMenu = YES;

  CuteCaptureView *captureView = [[CuteCaptureView alloc] initWithFrame:window.contentView.bounds];
  captureView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  captureView.mode = mode;
  captureView.screenFrame = screenFrame;
  captureView.mainScreenFrame = mainScreenFrame;
  captureView.imageRect = cute_selector_image_rect_for_screen(screenFrame, desktopFrame,
                                                              (uint32_t)imageWidth, (uint32_t)imageHeight);
  CGRect sliceBounds = CGRectIntersection(CuteRectToCGRect(captureView.imageRect),
                                          CGRectMake(0, 0, (CGFloat)imageWidth, (CGFloat)imageHeight));
  CGImageRef slice = CGImageCreateWithImageInRect(frozen, sliceBounds);
  captureView.frozenImage = slice != NULL ? slice : frozen;
  if (slice != NULL) {
    CGImageRelease(slice);
  }
  captureView.windows = mode == CuteCaptureModeWindow ? windows : @[];
  window.contentView = captureView;
  *outView = captureView;
  return window;
}

static int32_t CuteRunSelection(CuteCaptureMode mode, const char *outputPath,
                                const volatile bool *cancelSignal,
                                CuteCaptureSelection *result) {
  if (outputPath == NULL || result == NULL) {
    return 3;
  }
  memset(result, 0, sizeof(*result));
  if (cancelSignal != NULL && *cancelSignal) {
    result->status = 1;
    return 1;
  }

  CGRect quartzBounds = CuteActiveDisplayBounds();
  if (CGRectIsNull(quartzBounds) || CGRectIsEmpty(quartzBounds)) {
    result->status = 3;
    return 3;
  }
  CGImageRef frozen =
      CGWindowListCreateImage(CGRectNull, kCGWindowListOptionOnScreenOnly, kCGNullWindowID,
                              kCGWindowImageBestResolution | kCGWindowImageShouldBeOpaque);
  if (frozen == NULL) {
    result->status = 2;
    return 2;
  }

  __block BOOL cancelled = NO;
  __block NSRect selected = NSZeroRect;
  __block CuteRect selectedImageRect = {0};
  __block CGFloat selectedViewWidth = 1.0;
  __block CGFloat selectedViewHeight = 1.0;
  dispatch_sync(dispatch_get_main_queue(), ^{
    [NSApplication sharedApplication];
    NSArray<NSScreen *> *screens = NSScreen.screens;
    if (screens.count == 0) {
      cancelled = YES;
      return;
    }
    CuteRect desktopFrame = CuteRectFromCGRect(screens.firstObject.frame);
    for (NSScreen *screen in screens) {
      desktopFrame =
          CuteRectFromCGRect(NSUnionRect(CuteRectToCGRect(desktopFrame), screen.frame));
    }
    NSScreen *mainScreen = NSScreen.mainScreen ?: screens.firstObject;
    CuteRect mainScreenFrame = CuteRectFromCGRect(mainScreen.frame);
    NSArray<NSDictionary *> *windowCandidates =
        mode == CuteCaptureModeWindow ? CuteWindowCandidates() : @[];
    size_t imageWidth = CGImageGetWidth(frozen);
    size_t imageHeight = CGImageGetHeight(frozen);
    NSMutableArray<NSWindow *> *overlayWindows = [NSMutableArray array];
    NSMutableArray<CuteCaptureView *> *views = [NSMutableArray array];
    for (NSScreen *screen in screens) {
      CuteCaptureView *view = nil;
      NSWindow *window = CuteMakeOverlayWindow(screen, &view, mode, frozen, desktopFrame,
                                               mainScreenFrame, windowCandidates, imageWidth,
                                               imageHeight);
      [overlayWindows addObject:window];
      [views addObject:view];
      [window makeKeyAndOrderFront:nil];
      [window makeFirstResponder:view];
      [window invalidateCursorRectsForView:view];
    }
    [NSApp activateIgnoringOtherApps:YES];

    CuteCaptureView *finishedView = nil;
    while (finishedView == nil && !cancelled) {
      NSEvent *event = [NSApp nextEventMatchingMask:NSEventMaskAny
                                          untilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]
                                             inMode:NSDefaultRunLoopMode
                                            dequeue:YES];
      if (event != nil) {
        [NSApp sendEvent:event];
      }
      if (cancelSignal != NULL && *cancelSignal) {
        cancelled = YES;
        break;
      }
      for (CuteCaptureView *view in views) {
        if (view.accepted || view.cancelled) {
          finishedView = view;
          cancelled = view.cancelled;
          selected = view.selection;
          selectedImageRect = view.imageRect;
          selectedViewWidth = MAX(NSWidth(view.bounds), 1.0);
          selectedViewHeight = MAX(NSHeight(view.bounds), 1.0);
          break;
        }
      }
    }
    for (NSWindow *window in overlayWindows) {
      [window orderOut:nil];
      [window close];
    }
  });

  if (cancelled || NSIsEmptyRect(selected)) {
    CGImageRelease(frozen);
    result->status = 1;
    return 1;
  }

  size_t imageWidth = CGImageGetWidth(frozen);
  size_t imageHeight = CGImageGetHeight(frozen);
  CuteRect pixelSelection = cute_selector_pixels_from_view_rect(
      CuteRectFromCGRect(NSRectToCGRect(selected)), selectedViewWidth, selectedViewHeight,
      selectedImageRect);
  CGRect clamped = CGRectIntersection(CuteRectToCGRect(pixelSelection),
                                      CGRectMake(0, 0, imageWidth, imageHeight));
  if (CGRectIsEmpty(clamped)) {
    CGImageRelease(frozen);
    result->status = 3;
    return 3;
  }

  CGImageRef output = frozen;
  if (mode == CuteCaptureModeWindow) {
    output = CGImageCreateWithImageInRect(frozen, clamped);
    if (output == NULL) {
      CGImageRelease(frozen);
      result->status = 3;
      return 3;
    }
  }
  BOOL written = CuteWritePng(output, [NSString stringWithUTF8String:outputPath]);
  if (mode == CuteCaptureModeWindow) {
    CGImageRelease(output);
  }
  if (!written) {
    CGImageRelease(frozen);
    result->status = 3;
    return 3;
  }

  result->status = 0;
  result->x = (int32_t)CGRectGetMinX(clamped);
  result->y = (int32_t)CGRectGetMinY(clamped);
  result->width = (uint32_t)CGRectGetWidth(clamped);
  result->height = (uint32_t)CGRectGetHeight(clamped);
  result->frame_width = mode == CuteCaptureModeArea ? (uint32_t)imageWidth : result->width;
  result->frame_height = mode == CuteCaptureModeArea ? (uint32_t)imageHeight : result->height;
  CGImageRelease(frozen);
  return 0;
}

int32_t cute_capture_area(const char *outputPath, const volatile bool *cancelSignal,
                          CuteCaptureSelection *result) {
  return CuteRunSelection(CuteCaptureModeArea, outputPath, cancelSignal, result);
}

int32_t cute_capture_window(const char *outputPath, const volatile bool *cancelSignal,
                            CuteCaptureSelection *result) {
  return CuteRunSelection(CuteCaptureModeWindow, outputPath, cancelSignal, result);
}

int32_t cute_macos_pixel_backend(void) {
  if (@available(macOS 14.0, *)) {
    return 2;
  }
  if (@available(macOS 12.3, *)) {
    return 1;
  }
  return 0;
}
