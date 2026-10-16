#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#import <ServiceManagement/ServiceManagement.h>

int cs_autostart_state(void) {
    if (@available(macOS 13.0, *)) {
        return (int)SMAppService.mainAppService.status;
    }
    return -2;
}

int cs_autostart_set(bool enabled) {
    if (@available(macOS 13.0, *)) {
        NSError *error = nil;
        SMAppService *service = SMAppService.mainAppService;
        if (enabled && service.status == SMAppServiceStatusEnabled) return 1;
        if (!enabled && service.status == SMAppServiceStatusNotRegistered) return 0;
        BOOL success = enabled ? [service registerAndReturnError:&error] : [service unregisterAndReturnError:&error];
        return success ? (int)service.status : -1;
    }
    return -2;
}

void cs_autostart_open_settings(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (@available(macOS 13.0, *)) [SMAppService openSystemSettingsLoginItems];
        else [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:@"x-apple.systempreferences:com.apple.preferences.users?startupItemsPref"]];
    });
}

bool cs_autostart_login_launch(void) {
    NSAppleEventDescriptor *event = NSAppleEventManager.sharedAppleEventManager.currentAppleEvent;
    return event.eventID == kAEOpenApplication && [[event paramDescriptorForKeyword:keyAEPropData] enumCodeValue] == keyAELaunchedAsLogInItem;
}
