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
    owner, _, path = item.partition("@")
    pid = call(
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
        "GetConnectionUnixProcessID",
        "(s)",
        (owner,),
    )[0]
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
    settings = [entry for entry in entries if entry["label"] in ("Settings…", "Настройки…")]
    if len(settings) != 1:
        raise RuntimeError(f"Expected one settings item: {entries}")
    call(
        owner, menu_path, "com.canonical.dbusmenu", "Event", "(isvu)",
        (settings[0]["id"], "clicked", GLib.Variant("s", ""), 0),
    )
    print(json.dumps(entries))
    break
else:
    raise RuntimeError("The running application's tray item was not registered")
