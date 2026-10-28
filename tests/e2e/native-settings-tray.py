"""Exercise the running application's real Linux DBusMenu, selected by PID."""
import json
import sys

from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)


def call(destination, path, interface, method, signature, arguments):
    return bus.call_sync(
        destination,
        path,
        interface,
        method,
        GLib.Variant(signature, arguments),
        None,
        Gio.DBusCallFlags.NONE,
        5000,
        None,
    ).unpack()


registered = call(
    "org.kde.StatusNotifierWatcher",
    "/StatusNotifierWatcher",
    "org.freedesktop.DBus.Properties",
    "Get",
    "(ss)",
    ("org.kde.StatusNotifierWatcher", "RegisteredStatusNotifierItems"),
)[0]
for item in registered:
    owner, separator, path = item.partition("@")
    if not separator:
        owner, separator, suffix = item.partition("/")
        path = f"/{suffix}" if separator else "/StatusNotifierItem"
    try:
        pid = call(
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            "org.freedesktop.DBus",
            "GetConnectionUnixProcessID",
            "(s)",
            (owner,),
        )[0]
    except GLib.Error as error:
        if error.matches(Gio.dbus_error_quark(), Gio.DBusError.NAME_HAS_NO_OWNER):
            continue
        raise
    if str(pid) != sys.argv[1]:
        continue
    properties = call(
        owner, path, "org.freedesktop.DBus.Properties", "GetAll", "(s)",
        ("org.kde.StatusNotifierItem",),
    )[0]
    menu_path = properties["Menu"]
    layout = call(
        owner, menu_path, "com.canonical.dbusmenu", "GetLayout", "(iias)",
        (0, -1, ["label"]),
    )[1]
    entries = []

    def collect(node):
        identifier, attributes, children = node
        entries.append({"id": identifier, "label": attributes.get("label", "")})
        for child in children:
            collect(child)

    collect(layout)
    labels = (sys.argv[2],) if len(sys.argv) > 2 else ("Settings…", "Настройки…")
    selected = [entry for entry in entries if entry["label"] in labels]
    occurrence = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    if (
        not selected
        or occurrence < 0
        or occurrence >= len(selected)
        or (len(sys.argv) <= 3 and len(selected) != 1)
    ):
        raise RuntimeError(f"Expected menu item matching {labels} at {occurrence}: {entries}")
    call(
        owner, menu_path, "com.canonical.dbusmenu", "Event", "(isvu)",
        (selected[occurrence]["id"], "clicked", GLib.Variant("s", ""), 0),
    )
    print(json.dumps(entries))
    break
else:
    raise RuntimeError("The running application's tray item was not registered")
