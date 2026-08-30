#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#include <stdbool.h>
#include <stddef.h>

typedef struct {
  int32_t status;
  int32_t x;
  int32_t y;
  uint32_t width;
  uint32_t height;
  uint32_t frame_width;
  uint32_t frame_height;
} CuteCaptureSelection;

_Static_assert(sizeof(CuteCaptureSelection) == 28, "CuteCaptureSelection size drift");
_Static_assert(_Alignof(CuteCaptureSelection) == 4, "CuteCaptureSelection alignment drift");
_Static_assert(offsetof(CuteCaptureSelection, status) == 0, "status offset drift");
_Static_assert(offsetof(CuteCaptureSelection, x) == 4, "x offset drift");
_Static_assert(offsetof(CuteCaptureSelection, y) == 8, "y offset drift");
_Static_assert(offsetof(CuteCaptureSelection, width) == 12, "width offset drift");
_Static_assert(offsetof(CuteCaptureSelection, height) == 16, "height offset drift");
_Static_assert(offsetof(CuteCaptureSelection, frame_width) == 20, "frame_width offset drift");
_Static_assert(offsetof(CuteCaptureSelection, frame_height) == 24, "frame_height offset drift");

typedef bool (*CuteCancellationProbe)(const void *context);

static bool CuteCancellationRequested(const void *context, CuteCancellationProbe probe) {
  return probe != NULL && probe(context);
}

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

@interface CuteSelectorHandoffSession : NSObject
@property(nonatomic, copy) NSArray<NSWindow *> *windows;
- (void)closeImmediately;
@end

@implementation CuteSelectorHandoffSession

- (void)closeImmediately {
  for (NSWindow *window in self.windows) {
    [window orderOut:nil];
    [window close];
  }
  self.windows = @[];
}

@end

// The bridge retains at most one completed handoff session between the native
// selector and the quick WebView. Window ownership and cleanup live on the
// session itself; replacing the session deterministically closes the previous
// one.
static CuteSelectorHandoffSession *CutePendingAreaHandoff = nil;

static void CuteCloseAreaSelectorHandoff(void) {
  CuteSelectorHandoffSession *session = CutePendingAreaHandoff;
  CutePendingAreaHandoff = nil;
  [session closeImmediately];
}

static void CuteRetainAreaSelectorHandoff(NSArray<NSWindow *> *windows) {
  CuteCloseAreaSelectorHandoff();
  CuteSelectorHandoffSession *session = [[CuteSelectorHandoffSession alloc] init];
  session.windows = windows;
  CutePendingAreaHandoff = session;
  for (NSWindow *window in session.windows) {
    window.ignoresMouseEvents = YES;
  }
}

void cute_selector_complete_handoff(void) {
  void (^complete)(void) = ^{
    CuteSelectorHandoffSession *session = CutePendingAreaHandoff;
    CutePendingAreaHandoff = nil;
    // `makeKeyAndOrderFront:` commits the new WebView asynchronously through
    // CoreAnimation. Retain the accepted selector for two display intervals so
    // the compositor always has an opaque predecessor during that commit.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 34 * NSEC_PER_MSEC),
                   dispatch_get_main_queue(), ^{
      [session closeImmediately];
    });
  };
  if (NSThread.isMainThread) {
    complete();
  } else {
    dispatch_sync(dispatch_get_main_queue(), complete);
  }
}

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

CuteRect cute_selector_constrained_frame(CuteRect proposed, CuteRect screen_frame) {
  (void)proposed;
  return screen_frame;
}

void cute_quick_capture_set_presentation(void *windowPointer, bool revealed) {
  if (windowPointer == NULL) {
    return;
  }
  void (^apply)(void) = ^{
    NSWindow *window = (__bridge NSWindow *)windowPointer;
    window.ignoresMouseEvents = !revealed;
    // A fully transparent NSWindow may be classified as occluded, allowing
    // WKWebView/CoreAnimation to postpone the first composited surface. Keep a
    // practically invisible 1% mapped veil until the frontend has committed
    // stable canvas and chrome frames.
    window.alphaValue = revealed ? 1.0 : 0.01;
    if (revealed) {
      [window makeKeyAndOrderFront:nil];
    }
  };
  if (NSThread.isMainThread) {
    apply();
  } else {
    dispatch_sync(dispatch_get_main_queue(), apply);
  }
}

bool cute_quick_capture_fit_pointer_screen(void *windowPointer) {
  if (windowPointer == NULL) {
    return false;
  }
  __block BOOL fitted = NO;
  void (^apply)(void) = ^{
    NSPoint pointer = NSEvent.mouseLocation;
    NSScreen *target = nil;
    for (NSScreen *screen in NSScreen.screens) {
      if (NSPointInRect(pointer, screen.frame)) {
        target = screen;
        break;
      }
    }
    if (target == nil) {
      target = NSScreen.mainScreen ?: NSScreen.screens.firstObject;
    }
    if (target == nil) {
      return;
    }
    NSWindow *window = (__bridge NSWindow *)windowPointer;
    window.level = NSScreenSaverWindowLevel;
    window.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
                                NSWindowCollectionBehaviorFullScreenAuxiliary |
                                NSWindowCollectionBehaviorStationary;
    [window setFrame:target.frame display:NO animate:NO];
    fitted = NSEqualRects(window.frame, target.frame);
  };
  if (NSThread.isMainThread) {
    apply();
  } else {
    dispatch_sync(dispatch_get_main_queue(), apply);
  }
  return fitted;
}

bool cute_selector_draws_with_flipped_ctm(void) { return false; }

CuteRect cute_selector_image_rect_for_screen(CuteRect screen, CuteRect desktop,
                                             uint32_t image_width, uint32_t image_height) {
  double desktopWidth = desktop.width > 0.0 ? desktop.width : 1.0;
  double desktopHeight = desktop.height > 0.0 ? desktop.height : 1.0;
  return CuteRectMake(floor((screen.x - desktop.x) / desktopWidth * image_width),
                      floor((screen.y - desktop.y) / desktopHeight * image_height),
                      ceil(screen.width / desktopWidth * image_width),
                      ceil(screen.height / desktopHeight * image_height));
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
@property(nonatomic) NSRect captureScreenFrame;
@end

@implementation CuteCaptureWindow
- (BOOL)canBecomeKeyWindow {
  return YES;
}
- (BOOL)canBecomeMainWindow {
  return YES;
}
- (NSRect)constrainFrameRect:(NSRect)frameRect toScreen:(NSScreen *)screen {
  if (!NSIsEmptyRect(self.captureScreenFrame)) {
    return CuteRectToCGRect(cute_selector_constrained_frame(
        CuteRectFromCGRect(frameRect), CuteRectFromCGRect(self.captureScreenFrame)));
  }
  return frameRect;
}
@end

@class CuteCaptureView;

@interface CuteCaptureSession : NSObject
@property(nonatomic) NSPoint dragStartGlobal;
@property(nonatomic) NSRect selectionGlobal;
@property(nonatomic) BOOL dragging;
@property(nonatomic) BOOL accepted;
@property(nonatomic) BOOL cancelled;
@property(nonatomic, copy) NSArray<CuteCaptureView *> *views;
- (void)selectionDidChange;
@end

@interface CuteCaptureView : NSView
@property(nonatomic) CuteCaptureMode mode;
@property(nonatomic) CuteRect screenFrame;
@property(nonatomic) CuteRect mainScreenFrame;
@property(nonatomic) CuteRect imageRect;
@property(nonatomic) CGImageRef frozenImage;
@property(nonatomic, strong) NSImage *frozenNSImage;
@property(nonatomic, copy) NSArray<NSDictionary *> *windows;
@property(nonatomic) NSRect selection;
@property(nonatomic) BOOL accepted;
@property(nonatomic) BOOL cancelled;
@property(nonatomic, weak) CuteCaptureSession *session;
- (void)updateAreaSelectionFromSession;
@end

@implementation CuteCaptureSession

- (void)selectionDidChange {
  for (CuteCaptureView *view in self.views) {
    [view updateAreaSelectionFromSession];
  }
}

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
                        fromRect:CuteRectToCGRect(self.imageRect)
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

- (NSPoint)globalPointForEvent:(NSEvent *)event {
  return [self.window convertPointToScreen:event.locationInWindow];
}

- (void)updateAreaSelectionFromSession {
  NSRect intersection = NSIntersectionRect(self.session.selectionGlobal, self.window.frame);
  if (NSIsEmptyRect(intersection)) {
    self.selection = NSZeroRect;
  } else {
    NSRect windowRect = [self.window convertRectFromScreen:intersection];
    self.selection = [self convertRect:windowRect fromView:nil];
  }
  [self setNeedsDisplay:YES];
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
  self.session.dragging = YES;
  self.session.dragStartGlobal = [self globalPointForEvent:event];
  self.session.selectionGlobal = NSZeroRect;
  [self.session selectionDidChange];
}

- (void)mouseDragged:(NSEvent *)event {
  if (!self.session.dragging || self.mode != CuteCaptureModeArea) {
    return;
  }
  NSPoint point = [self globalPointForEvent:event];
  CGFloat x = MIN(self.session.dragStartGlobal.x, point.x);
  CGFloat y = MIN(self.session.dragStartGlobal.y, point.y);
  self.session.selectionGlobal =
      NSMakeRect(x, y, fabs(point.x - self.session.dragStartGlobal.x),
                 fabs(point.y - self.session.dragStartGlobal.y));
  [self.session selectionDidChange];
}

- (void)mouseUp:(NSEvent *)event {
  if (!self.session.dragging || self.mode != CuteCaptureModeArea) {
    return;
  }
  [self mouseDragged:event];
  self.session.dragging = NO;
  if (NSWidth(self.session.selectionGlobal) >= 2.0 &&
      NSHeight(self.session.selectionGlobal) >= 2.0) {
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
  if (self.mode == CuteCaptureModeArea) {
    self.session.accepted = accepted;
    self.session.cancelled = !accepted;
    return;
  }
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

static CGRect CuteDisplayBounds(NSScreen *screen) {
  NSNumber *screenNumber = screen.deviceDescription[@"NSScreenNumber"];
  if (screenNumber == nil) {
    return CGRectNull;
  }
  return CGDisplayBounds((CGDirectDisplayID)screenNumber.unsignedIntValue);
}

static CGImageRef CuteCreateVirtualDesktopImage(CGRect desktopBounds) {
  return CGWindowListCreateImage(desktopBounds, kCGWindowListOptionOnScreenOnly,
                                 kCGNullWindowID,
                                 kCGWindowImageBestResolution | kCGWindowImageShouldBeOpaque);
}

static NSWindow *CuteMakeOverlayWindow(NSScreen *screen, CuteCaptureView **outView,
                                       CuteCaptureMode mode, CGImageRef frozen,
                                       CuteRect mainScreenFrame, CuteRect desktopPixelFrame,
                                       CuteRect displayPixelFrame,
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
  window.captureScreenFrame = windowFrame;
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
  captureView.imageRect = cute_selector_image_rect_for_screen(
      displayPixelFrame, desktopPixelFrame, (uint32_t)imageWidth, (uint32_t)imageHeight);
  captureView.frozenImage = frozen;
  captureView.windows = mode == CuteCaptureModeWindow ? windows : @[];
  window.contentView = captureView;
  *outView = captureView;
  return window;
}

static int32_t CuteRunSelectionInner(CuteCaptureMode mode, const char *outputPath,
                                     const void *cancelContext,
                                     CuteCancellationProbe cancelProbe,
                                     CuteCaptureSelection *result) {
  if (outputPath == NULL || result == NULL) {
    return 3;
  }
  memset(result, 0, sizeof(*result));
  if (CuteCancellationRequested(cancelContext, cancelProbe)) {
    result->status = 1;
    return 1;
  }

  cute_selector_complete_handoff();

  CGRect quartzBounds = CuteActiveDisplayBounds();
  if (CGRectIsNull(quartzBounds) || CGRectIsEmpty(quartzBounds)) {
    result->status = 3;
    return 3;
  }
  CGImageRef virtualFrozen = CuteCreateVirtualDesktopImage(quartzBounds);
  if (virtualFrozen == NULL) {
    result->status = 3;
    return 3;
  }
  size_t virtualImageWidth = CGImageGetWidth(virtualFrozen);
  size_t virtualImageHeight = CGImageGetHeight(virtualFrozen);

  __block BOOL cancelled = NO;
  __block NSRect selected = NSZeroRect;
  __block CGImageRef selectedFrozen = NULL;
  __block CuteRect selectedImageRect = {0};
  __block CGFloat selectedViewWidth = 1.0;
  __block CGFloat selectedViewHeight = 1.0;
  __block CGRect selectedPixels = CGRectNull;
  void (^runSelection)(void) = ^{
    [NSApplication sharedApplication];
    NSArray<NSScreen *> *screens = NSScreen.screens;
    if (screens.count == 0) {
      cancelled = YES;
      return;
    }
    NSScreen *mainScreen = NSScreen.mainScreen ?: screens.firstObject;
    CuteRect mainScreenFrame = CuteRectFromCGRect(mainScreen.frame);
    NSArray<NSDictionary *> *windowCandidates =
        mode == CuteCaptureModeWindow ? CuteWindowCandidates() : @[];
    NSMutableArray<NSWindow *> *overlayWindows = [NSMutableArray array];
    NSMutableArray<CuteCaptureView *> *views = [NSMutableArray array];
    CuteCaptureSession *session = [[CuteCaptureSession alloc] init];
    for (NSScreen *screen in screens) {
      CGRect displayBounds = CuteDisplayBounds(screen);
      if (CGRectIsNull(displayBounds) || CGRectIsEmpty(displayBounds)) {
        cancelled = YES;
        break;
      }
      CuteCaptureView *view = nil;
      NSWindow *window = CuteMakeOverlayWindow(
          screen, &view, mode, virtualFrozen, mainScreenFrame,
          CuteRectFromCGRect(quartzBounds), CuteRectFromCGRect(displayBounds), windowCandidates,
          virtualImageWidth, virtualImageHeight);
      [overlayWindows addObject:window];
      [views addObject:view];
    }
    session.views = views;
    for (CuteCaptureView *view in views) {
      view.session = session;
    }
    for (NSUInteger index = 0; index < overlayWindows.count; index++) {
      NSWindow *window = overlayWindows[index];
      CuteCaptureView *view = views[index];
      [window makeKeyAndOrderFront:nil];
      [window makeFirstResponder:view];
      [window invalidateCursorRectsForView:view];
    }
    [NSApp activateIgnoringOtherApps:YES];

    CuteCaptureView *finishedView = nil;
    while (finishedView == nil && !session.accepted && !session.cancelled && !cancelled) {
      NSEvent *event = [NSApp nextEventMatchingMask:NSEventMaskAny
                                          untilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]
                                             inMode:NSDefaultRunLoopMode
                                            dequeue:YES];
      if (event != nil) {
        [NSApp sendEvent:event];
      }
      if (CuteCancellationRequested(cancelContext, cancelProbe)) {
        cancelled = YES;
        break;
      }
      for (CuteCaptureView *view in views) {
        if (view.accepted || view.cancelled) {
          finishedView = view;
          cancelled = view.cancelled;
          selected = view.selection;
          selectedFrozen = CGImageRetain(view.frozenImage);
          selectedImageRect = view.imageRect;
          selectedViewWidth = MAX(NSWidth(view.bounds), 1.0);
          selectedViewHeight = MAX(NSHeight(view.bounds), 1.0);
          break;
        }
      }
    }
    if (mode == CuteCaptureModeArea && (session.accepted || session.cancelled)) {
      cancelled = session.cancelled;
      if (!cancelled) {
        selectedFrozen = CGImageRetain(virtualFrozen);
        for (CuteCaptureView *view in views) {
          if (NSIsEmptyRect(view.selection)) {
            continue;
          }
          CuteRect pixels = cute_selector_pixels_from_view_rect(
              CuteRectFromCGRect(NSRectToCGRect(view.selection)), MAX(NSWidth(view.bounds), 1.0),
              MAX(NSHeight(view.bounds), 1.0), view.imageRect);
          CGRect pixelRect = CuteRectToCGRect(pixels);
          selectedPixels = CGRectIsNull(selectedPixels) ? pixelRect
                                                        : CGRectUnion(selectedPixels, pixelRect);
        }
        selected = NSRectFromCGRect(selectedPixels);
      }
    }
    if (!cancelled && finishedView != nil && mode == CuteCaptureModeArea) {
      // Keep the exact accepted frozen frame and selection above the desktop.
      // The ready quick WebView is ordered over it and explicitly completes
      // this handoff after its canvas and chrome have composited.
      CuteRetainAreaSelectorHandoff(overlayWindows);
    } else {
      for (NSWindow *window in overlayWindows) {
        [window orderOut:nil];
        [window close];
      }
    }
  };
  if (NSThread.isMainThread) {
    runSelection();
  } else {
    dispatch_sync(dispatch_get_main_queue(), runSelection);
  }
  CGImageRelease(virtualFrozen);

  if (cancelled || NSIsEmptyRect(selected)) {
    cute_selector_complete_handoff();
    if (selectedFrozen != NULL) {
      CGImageRelease(selectedFrozen);
    }
    result->status = 1;
    return 1;
  }

  if (selectedFrozen == NULL) {
    cute_selector_complete_handoff();
    result->status = 3;
    return 3;
  }
  size_t imageWidth = CGImageGetWidth(selectedFrozen);
  size_t imageHeight = CGImageGetHeight(selectedFrozen);
  CuteRect pixelSelection = mode == CuteCaptureModeArea
                                ? CuteRectFromCGRect(selectedPixels)
                                : cute_selector_pixels_from_view_rect(
                                      CuteRectFromCGRect(NSRectToCGRect(selected)),
                                      selectedViewWidth, selectedViewHeight, selectedImageRect);
  CGRect clamped = CGRectIntersection(CuteRectToCGRect(pixelSelection),
                                      CGRectMake(0, 0, imageWidth, imageHeight));
  if (CGRectIsEmpty(clamped)) {
    cute_selector_complete_handoff();
    CGImageRelease(selectedFrozen);
    result->status = 3;
    return 3;
  }

  CGImageRef output = selectedFrozen;
  if (mode == CuteCaptureModeWindow) {
    output = CGImageCreateWithImageInRect(selectedFrozen, clamped);
    if (output == NULL) {
      cute_selector_complete_handoff();
      CGImageRelease(selectedFrozen);
      result->status = 3;
      return 3;
    }
  }
  BOOL written = CuteWritePng(output, [NSString stringWithUTF8String:outputPath]);
  if (mode == CuteCaptureModeWindow) {
    CGImageRelease(output);
  }
  if (!written) {
    cute_selector_complete_handoff();
    CGImageRelease(selectedFrozen);
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
  CGImageRelease(selectedFrozen);
  return 0;
}

static int32_t CuteRunSelection(CuteCaptureMode mode, const char *outputPath,
                                const void *cancelContext,
                                CuteCancellationProbe cancelProbe,
                                CuteCaptureSelection *result) {
  @autoreleasepool {
    return CuteRunSelectionInner(mode, outputPath, cancelContext, cancelProbe, result);
  }
}

int32_t cute_capture_area(const char *outputPath, const void *cancelContext,
                          CuteCancellationProbe cancelProbe, CuteCaptureSelection *result) {
  return CuteRunSelection(CuteCaptureModeArea, outputPath, cancelContext, cancelProbe, result);
}

int32_t cute_capture_window(const char *outputPath, const void *cancelContext,
                            CuteCancellationProbe cancelProbe, CuteCaptureSelection *result) {
  return CuteRunSelection(CuteCaptureModeWindow, outputPath, cancelContext, cancelProbe, result);
}

int32_t cute_macos_pixel_backend(void) {
  // The current bridge captures still images through CoreGraphics on every
  // supported release. Do not label diagnostics as ScreenCaptureKit until the
  // SCStream/SCScreenshotManager implementation is actually wired in.
  return 0;
}
