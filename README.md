# Grid Desktop

A customizable desktop widget and icon manager extension for GNOME Shell, providing an interactive, density-adaptive grid on your desktop canvas.

![Gridgets Preview](assets/screenshot/screenshot_all_widgets.png)
---

## Features

- **Desktop Icon Integration:** Native desktop icon management aligned seamlessly with the custom desktop grid alongside your widgets.
- **Dynamic Grid Scaling:** Automatically adapts to any screen resolution and aspect ratio — full support for standard 16:9 displays and Ultrawide (21:9 / 32:9) monitors.
- **Smart Multi-Monitor Support:** Cleanly handles display topology changes (docking, undocking, laptop lid open/close) across Wayland and X11 sessions.
- **Versatile & Multi-Purpose Widgets:** Diverse widget catalog including System Monitors, Media Player, Storage Bar (with custom mount/partition selection), Quick Notes, Screen Time, and more. Highly configurable widgets—such as Weather Cards—can be placed multiple times independently to monitor different metrics (UV index, AQI, feels like, dew point, cloud cover, etc.) or different locations simultaneously.
- **Precision Alignment:** Snap-to-grid placement with dynamic collision avoidance and interactive resizing.
- **Deep Appearance Customization:** Define unified global styling or override settings per widget:
  - Custom background color
  - Granular background opacity control (0–100%)
  - Custom text & icon foreground colors
  - Per-widget font family customization (and dedicated font size overrides for Notes)
  - Full support for Adwaita light/dark modes and system accent colors.
---

## Compatibility

- **GNOME Shell:** 47, 48, 49, 50 
- **Display Server:** Wayland (recommended) & X11

---

## Manual Installation

1. Clone the repository:
git clone https://github.com/pelach/grid-desktop.git
cd grid-desktop

2. Install to GNOME Extensions directory:
mkdir -p ~/.local/share/gnome-shell/extensions/grid-desktop@pelach.github.com
cp -r * ~/.local/share/gnome-shell/extensions/grid-desktop@pelach.github.com/

3. Restart GNOME Shell and Enable:

X11: Press Alt + F2, type r, and press Enter.

Wayland: Log out and log back in.

4. Enable the extension:
gnome-extensions enable grid-desktop@pelach.github.com

## Development and Debugging
To monitor extension logs in real-time:
journalctl -f -o cat /usr/bin/gnome-shell | grep -E "grid-desktop|DesktopGrid"

To recompile schemas after updating org.gnome.shell.extensions.grid-desktop.gschema.xml:
glib-compile-schemas schemas/


## Acknowledgments
Based on the original Gridgets extension by rebatnaath.

Refactored, enhanced, and maintained by András Pelach (with development assistance from Google Gemini).

## License
This project is licensed under the GPL-3.0 License.
