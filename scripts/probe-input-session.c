// Read-only macOS diagnostic. Prints booleans only, never the session dictionary.
// Does not request permission, create input events, or inspect input contents.
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>

static const char *boolean_value(CFDictionaryRef session, CFStringRef key) {
    CFTypeRef value = session ? CFDictionaryGetValue(session, key) : NULL;
    if (!value) return "missing";
    if (CFGetTypeID(value) != CFBooleanGetTypeID()) return "not-boolean";
    return CFBooleanGetValue((CFBooleanRef)value) ? "true" : "false";
}
int main(void) {
    CFDictionaryRef session = CGSessionCopyCurrentDictionary();
    printf("input_permission=%s\nsession_available=%s\non_console=%s\nlogin_done=%s\nscreen_locked=%s\n",
        CGPreflightListenEventAccess() ? "true" : "false", session ? "true" : "false",
        boolean_value(session, kCGSessionOnConsoleKey),
        boolean_value(session, kCGSessionLoginDoneKey),
        boolean_value(session, CFSTR("CGSSessionScreenIsLocked")));
    if (session) CFRelease(session);
    return 0;
}
