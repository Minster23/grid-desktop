# Grid Desktop

A high-performance desktop widget ecosystem and icon manager for GNOME Shell, powered by a screen-adaptive canvas grid and pure Clutter rendering.

![Gridgets Preview](assets/screenshot/screenshot_all_widgets.png)
---

### Core Architecture & Highlights
- **Dynamic Grid Scaling**: Automatically adapts cell sizing and layout to any display resolution and aspect ratio — full native support for standard 16:9 displays and Ultrawide (21:9 / 32:9) monitors.
- **Smart Multi-Monitor Support**: Cleanly handles display topology changes (docking, undocking, laptop lid open/close) across Wayland and X11 sessions, with per-widget monitor pinning (e.g. pinned to Primary Monitor or Follow Global).
- **Precision Alignment & Grid Overlay**: Snap-to-grid placement with dynamic collision avoidance and interactive resizing across up to 3 widget sizes. Includes a toggleable on-screen grid overlay to make layout designing effortless.
- **Pure Clutter Engine**: High-performance, lightweight rendering directly via Clutter without external CSS dependencies, built for GNOME 48, 49, 50, and 51.
- **Integrated Desktop Icon Manager**: Native desktop icon support snapped cleanly to the adaptive grid:
  - Customizable alignment (e.g., Left / Right) and sort orientation (Vertical / Horizontal)
  - Toggle icon labels and auto-layout re-organization
  - Native shortcuts for Home folder, Trash, and mounted/network drives
- **Unified Appearance & Theming**:
  - Full system theme integration: follow GNOME Adwaita light/dark schemes automatically
  - Preset color themes and manual system Accent Color override
  - Granular global & per-widget styling: background colors, background opacity slider (0–100%), foreground/text colors, and custom font families
- **Dedicated Insights & Data Export**: Built-in tracking hub with detailed day-by-day breakdowns for active Screen Time and Mood trends, featuring one-click JSON data export.

---

### Widgets & Customization Options
#### Weather & Sun
*Comprehensive Open-Meteo powered weather tracking with dynamic visuals and modular metrics.*

- **Weather Standard**: Clean weather tile showcasing current sky conditions, temperature, and daily high/low.
- **Weather Minimal**: Focused, minimal tile displaying current temperature and location.
- **Weather Forecast**: Expanded layout featuring current conditions alongside an hourly forecast breakdown.
- **Weather Daily Bars**: Multi-day extended forecast with visual temperature range bars.
- **Solar Schedule**: Visual day/night curve showing real-time sun progression, sunrise, sunset, and remaining daylight hours.
- **Weather Cards**: Modular glance cards that can be placed independently to monitor a specific environmental metric with an optional trend chart:
  - UV Index
  - Humidity
  - Air Quality (AQI)
  - Wind Speed
  - Pressure
  - Feels Like
  - Wind Gusts
  - Dew Point
  - Cloud Cover
  - Precipitation

**Weather Customization & Settings:**
- **Location**: Search and select any custom city worldwide (independent location possible per widget).
- **Dynamic Weather Color**: Automatically tints widget highlights and backgrounds to reflect current weather conditions.
- **Dynamic Weather Overlay**: Real-time atmospheric backdrop illustrations reflecting live weather states (e.g., sunny, clouds, overcast, rain).
- **Temperature Units**: Seamless toggle between Celsius and Fahrenheit.
- **Trend Charts**: Optional history/trend sparkline graphs for modular weather cards.
- **Styling Overrides**: Custom font family, background color, opacity slider (0–100%), and text/icon colors per card.

#### Media & Imagery
*Dynamic desktop media playback controls and visual display tiles.*

- **Music Player**: Compact media player featuring album artwork, track details, and playback controls. Supports vinyl disc styling and integrated real-time audio spectrum visualization (e.g., 16-Bar Equalizer).
- **Music Player (Wide)**: Expanded horizontal layout displaying album artwork alongside track info, artist details, and playback controls. Capable of dynamically adapting its background accent to match the current album artwork colors.
- **Image / GIF**: Displays static images or animated GIFs directly on the desktop grid, with support for custom image captions.
- **Image Slideshow**: Cycles smoothly through local images from a selected folder using crossfade transitions, with support for image captions.

**Media Player Settings & Controls:**
- **MPRIS2 Integration**: Automatically detects active players with options to ignore browser media players or lock focus to a specific player (e.g., Spotify).
- **Playback Controls**: Toggleable playback buttons (play/pause, previous/next track).
- **Vinyl Disc Mode**: Optional vinyl record styling with interactive playback tracking.
- **Audio Spectrum**: Real-time fluid frequency visualizer on the compact player with selectable visualizer patterns (e.g., 16-Bar Equalizer).
- **Dynamic Artwork Accent**: Automatic background tint matching active album art on the wide player layout.
- **Styling Overrides**: Custom font family, background color, opacity slider (0–100%), and foreground text/icon colors.

#### System Monitor & Hardware
*Comprehensive hardware monitoring, system telemetry, and desktop power utilities.*

- **System Dashboard**: All-in-one system overview tracking CPU history, temperature, active tasks, network traffic, and RAM usage.
- **System Monitor**: Dual real-time graph monitor displaying CPU and RAM resource utilization side-by-side.
- **Storage Bar**: Visual multi-category disk breakdown (System, Media, Archive, Docs, Free space) with support for targeting custom paths and partitions.
- **Resource Wheel**: Circular hardware telemetry dial summarizing CPU, RAM, Disk, and Temperature status.
- **System Info**: Modular glance tile displaying an individual system metric with an optional trend chart:
  - CPU Usage
  - RAM Usage
  - Disk Usage
  - Thermal (CPU)
  - GPU Temp
- **Network Speed**: Real-time upload and download throughput monitor with traffic trend lines.
- **Ping Monitor**: Live latency monitor showing response times and server connectivity status.
- **Quick Toggles**: Fast access toggles for Dark Mode, Night Light, Do Not Disturb (DND), and screen lock.
- **Power Controls**: Quick power management buttons for suspend, reboot, shutdown, and logout.
- **Power Profiles**: One-click switcher for system power management modes (Power Saver, Balanced, Performance).
- **Battery Status**: Unified charge monitor tracking laptop battery percentage and charging state alongside connected Bluetooth peripherals.
- **Audio Output**: Fast device switcher to toggle between connected audio sinks (Analog, S/PDIF, HDMI/DisplayPort).
- **Control Sliders**: Interactive on-canvas sliders for master audio volume and display brightness.

#### Productivity & Organization
*Desktop workflow, task management, and productivity enhancement tools.*

- **Pomodoro Timer**: Full focus timer featuring circular progress visualization, dedicated work and break cycle tracking, and playback/reset controls.
- **Pomodoro Focus**: Compact horizontal focus tracker with one-click mode switching (Work/Break), session completion counter, and start/reset controls.
- **Tasks**: Streamlined to-do checklist with a pending task counter, checkable completion states, quick task creation, and item deletion.
- **Quick Notes**: Direct markdown sticky note scratchpad on the desktop canvas with an inline edit mode for notes and checklist items.
- **Clipboard History**: Quick-access local clipboard manager showing recent copied text snippets for fast reference and reuse.
- **App Launcher**: Compact desktop dock providing one-click launch access for up to 8 installed applications.

#### Time & Calendar
*Precision desktop timekeeping, global clocks, countdowns, and schedule trackers.*

- **Time & Date**: Clean digital clock displaying the current time and full date.
- **Analog Clock**: Fully customizable vector analog clock with a smooth sweeping second hand. Supports SVG-based clock skins, custom dial artwork, and the ability to toggle the background box off to display a floating clock face.
- **World Clock**: Multi-city digital clock showing live times across global timezones simultaneously.
- **World Analog Clock**: Quad analog dial layout displaying multiple timezone clocks in a single unified widget.
- **Calendar**: Classic single-day calendar page showing the current day and month with today highlighted and month navigation controls.
- **Month Calendar**: Compact month grid view highlighting current dates and color-coding weekends.
- **Timer**: Simple countdown timer widget with progress tracking and pause/reset controls.
- **Countdown**: Target date and deadline countdown tracker displaying remaining days and time within a circular progress gauge.
- **Stopwatch**: Clean desktop stopwatch with elapsed time display and playback controls.

**Analog Clock Settings & Customization:**
- **Clock Skins**: Multiple built-in skins available (Basic, Community, Osx, Rolex, Sensa) alongside support for custom SVG designs.
- **Second Hand**: Toggleable smooth second hand visibility.
- **Show Background Box**: Option to hide the widget background card completely, rendering only the standalone clock face directly on the desktop canvas.
- **Styling Overrides**: Custom font family, background color, opacity slider (0–100%), and accent/hand colors.


#### Personal & Tracking
*Habit formation, market tracking, daily wellness, and informational feeds.*

- **Currency Tracker**: Live foreign exchange rate tracker featuring a 30-day historical trend chart powered by Frankfurter API. Customizable base and target currency pairs (e.g., EUR/HUF).
- **Crypto Tracker**: Live cryptocurrency price tracking for major assets (BTC, ETH, SOL) with a 24h market trend line powered by CoinGecko. Configurable target fiat/base currency for value calculations.
- **GitHub Activity**: Desktop GitHub contribution heat map showing profile avatar, yearly total contributions, and real-time sync status based on a configured GitHub username.
- **Habit Tracker**: Routine and habit tracker designed to log daily achievements, record streaks, and measure progress over time.
- **Watermind**: Smart hydration tracker operating across an 8-hour daily active window. Supports customizable target daily intake (ml), configurable periodic reminder intervals, and 4 quick-log preset volume buttons (e.g., 200, 300, 500, 750 ml).
- **Mood Logger**: Daily emotional wellbeing tracker logging moods with visual color progression across the previous four weeks.
- **Screen Time**: Active desktop session monitor with a time-of-day bar chart and application breakdown.
- **Today in History**: Daily historical milestones and notable events fetched directly from Wikipedia.
- **RSS Headlines**: Compact, auto-rotating news reader displaying article summaries and headlines from custom RSS feeds.
- **Quotes**: Daily inspirational quotes from philosophers, programmers, and thinkers updated automatically.
- **Calendar Tasks**: Aggregated daily agenda widget displaying today's scheduled events from synchronized calendars with custom category colors.

---

## Compatibility

- **GNOME Shell:** 48, 49, 50, 51 
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
