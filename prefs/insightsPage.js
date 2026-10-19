import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import { getGridgetsDataDir, todayDateString, resolveDesktopAppInfo } from '../utils/widgetUtils.js';
import { listMoodDatesSync, getMood, loadDatesSync } from '../utils/moodStore.js';
import { clearBox } from './displayUtils.js';

const CSS_DATA = `
    .mood-level-1 { color: #F43F5E; }
    .mood-level-2 { color: #F97316; }
    .mood-level-3 { color: #EAB308; }
    .mood-level-4 { color: #22C55E; }
    .mood-level-5 { color: #3B82F6; }
    .mood-none { color: rgba(128, 128, 128, 0.5); }
`;
const CSS_PROVIDER = new Gtk.CssProvider();
if (CSS_PROVIDER.load_from_string) {
    CSS_PROVIDER.load_from_string(CSS_DATA);
} else {
    CSS_PROVIDER.load_from_data(CSS_DATA, CSS_DATA.length);
}
Gtk.StyleContext.add_provider_for_display(
    Gdk.Display.get_default(),
    CSS_PROVIDER,
    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
);

const HOURS_PER_DAY = 24;

const RANGE_PRESETS = [
    { label: 'Last 7 Days', days: 7 },
    { label: 'Last 14 Days', days: 14 },
    { label: 'Last 30 Days', days: 30 },
    { label: 'All Time', days: 0 },
];

const MOOD_LEVELS = [
    { level: 1, label: 'Sad', icon: 'face-sad-symbolic', color: '#F43F5E' },
    { level: 2, label: 'Worried', icon: 'face-worried-symbolic', color: '#F97316' },
    { level: 3, label: 'Neutral', icon: 'face-plain-symbolic', color: '#EAB308' },
    { level: 4, label: 'Happy', icon: 'face-smile-symbolic', color: '#22C55E' },
    { level: 5, label: 'Ecstatic', icon: 'face-laugh-symbolic', color: '#3B82F6' },
];

function formatCompactDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0)
        return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
    return `${minutes}m`;
}

function formatDateString(dateString) {
    const [y, m, d] = dateString.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[m - 1]} ${y}`;
}

function daysAgoDate(days) {
    const dt = GLib.DateTime.new_now_local().add_days(-days);
    const y = dt.get_year();
    const m = dt.get_month().toString().padStart(2, '0');
    const d = dt.get_day_of_month().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function resolveAppName(appId) {
    const appInfo = resolveDesktopAppInfo(appId);
    if (appInfo) {
        const name = appInfo.get_display_name();
        if (name && name.trim() !== '') return name;
    }
    const base = appId.replace(/\.desktop$/i, '');
    return base.split('.').pop() || appId;
}

function listDayFiles() {
    const dir = getGridgetsDataDir('screen-time');
    const files = [];
    try {
        const dirFile = Gio.File.new_for_path(dir);
        const enumerator = dirFile.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const name = info.get_name();
            if (name.endsWith('.json'))
                files.push(name.replace('.json', ''));
        }
    } catch (_e) {
        // Directory doesn't exist yet
    }
    files.sort().reverse();
    return files;
}

function loadDaySummary(dateString) {
    const filePath = GLib.build_filenamev([getGridgetsDataDir('screen-time'), `${dateString}.json`]);
    const file = Gio.File.new_for_path(filePath);
    try {
        const [ok, bytes] = file.load_contents(null);
        if (!ok) return null;
        const data = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        if (!data || typeof data.apps !== 'object') return null;
        let totalSeconds = 0;
        const appTotals = [];
        for (const [key, hours] of Object.entries(data.apps)) {
            if (!key || key.startsWith('window:')) continue;
            if (!Array.isArray(hours)) continue;

            let appTotal = 0;
            for (let h = 0; h < Math.min(hours.length, HOURS_PER_DAY); h++)
                appTotal += hours[h];
            if (appTotal > 0)
                appTotals.push({ key, seconds: appTotal });
            totalSeconds += appTotal;
        }
        appTotals.sort((a, b) => b.seconds - a.seconds);
        return { date: dateString, totalSeconds, apps: appTotals };
    } catch (_e) {
        return null;
    }
}

function filterByRange(dates, rangeIndex) {
    const preset = RANGE_PRESETS[rangeIndex];
    if (preset.days === 0)
        return dates;
    const cutoff = daysAgoDate(preset.days);
    return dates.filter(d => d >= cutoff);
}

function buildEmptyState(iconName, title, description) {
    const page = new Adw.StatusPage({
        icon_name: iconName,
        title: title,
        description: description,
    });
    page.add_css_class('compact');
    return page;
}

function buildDayNavRow(title) {
    const row = new Adw.ActionRow({ title });
    const prevBtn = new Gtk.Button({
        icon_name: 'go-previous-symbolic',
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    const nextBtn = new Gtk.Button({
        icon_name: 'go-next-symbolic',
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    row.add_suffix(prevBtn);
    row.add_suffix(nextBtn);
    return { row, prevBtn, nextBtn };
}

function buildExportDialog(parentWindow, title, defaultFilename, jsonString) {
    const dialog = new Gtk.FileDialog({ title });
    const filter = new Gtk.FileFilter();
    filter.set_name('JSON');
    filter.add_mime_type('application/json');
    filter.add_pattern('*.json');
    const filters = new Gio.ListStore({ item_type: Gtk.FileFilter });
    filters.append(filter);
    dialog.set_filters(filters);
    dialog.set_initial_name(defaultFilename);
    dialog.save(parentWindow, null, (dlg, result) => {
        try {
            const file = dlg.save_finish(result);
            if (file) {
                let path = file.get_path();
                if (!path && file.get_uri())
                    path = GLib.filename_from_uri(file.get_uri())[0];
                if (path) {
                    const bytes = new TextEncoder().encode(jsonString);
                    const gioFile = Gio.File.new_for_path(path);
                    gioFile.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                }
            }
        } catch (error) {
            if (!error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                console.error('Export dialog failed:', error);
        }
    });
}

export function buildInsightsPage(settings) {
    const page = new Adw.PreferencesPage({
        title: 'Insights',
        icon_name: 'org.gnome.Extensions-symbolic',
    });

    let selectedRange = 2;
    let stAvailableDates = [];
    let stSelectedDate = '';
    let moodAvailableDates = [];
    let moodSelectedDate = '';

    // 1. DATE RANGE
    const filterGroup = new Adw.PreferencesGroup({
        title: 'Date Range',
        description: 'Filter data by time period.',
    });
    const rangeModel = new Gtk.StringList();
    RANGE_PRESETS.forEach(p => rangeModel.append(p.label));
    const rangeRow = new Adw.ComboRow({
        title: 'Range',
        model: rangeModel,
        selected: selectedRange,
    });
    rangeRow.connect('notify::selected', () => {
        selectedRange = rangeRow.get_selected();
        refreshAll();
    });
    filterGroup.add(rangeRow);
    page.add(filterGroup);

    // 2. SCREEN TIME SUMMARY
    const stSummaryGroup = new Adw.PreferencesGroup({
        title: 'Screen Time',
        description: 'Overview of your desktop usage across the selected period.',
    });
    const stTotalRow = new Adw.ActionRow({ title: 'Total Screen Time' });
    const stAvgRow = new Adw.ActionRow({ title: 'Daily Average' });
    const stTopAppRow = new Adw.ActionRow({ title: 'Most Used App' });
    const stBestRow = new Adw.ActionRow({ title: 'Most Productive Day' });
    const stDaysRow = new Adw.ActionRow({ title: 'Days Tracked' });
    stSummaryGroup.add(stTotalRow);
    stSummaryGroup.add(stAvgRow);
    stSummaryGroup.add(stTopAppRow);
    stSummaryGroup.add(stBestRow);
    stSummaryGroup.add(stDaysRow);

    const clearStBtn = new Adw.ActionRow({
        title: 'Clear Screen Time Data',
        activatable: true,
    });
    clearStBtn.connect('activated', () => {
        const dialog = new Adw.AlertDialog({
            heading: 'Clear All Screen Time Data?',
            body: 'This cannot be undone.',
        });
        dialog.add_response('cancel', 'Cancel');
        dialog.add_response('clear', 'Clear');
        dialog.set_response_appearance('clear', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');
        dialog.connect('response', (_dlg, responseId) => {
            if (responseId === 'clear') clearAllScreenTimeData(refreshAll);
            else refreshAll();
        });
        dialog.present(page.get_root());
    });
    stSummaryGroup.add(clearStBtn);
    page.add(stSummaryGroup);

    const stEmptyBox = buildEmptyState(
        'preferences-system-time-symbolic',
        'No Screen Time Data Yet',
        'Screen time tracking will appear here once the Screen Time widget is active on your desktop.'
    );
    const stEmptyGroup = new Adw.PreferencesGroup();
    stEmptyGroup.add(stEmptyBox);
    page.add(stEmptyGroup);

    // 3. DAY DETAIL (Screen time)
    const stDayGroup = new Adw.PreferencesGroup({
        title: 'Day Detail',
        description: 'Browse daily usage breakdowns.',
    });
    const stNav = buildDayNavRow('Selected Day');
    stDayGroup.add(stNav.row);
    const stDayTotalRow = new Adw.ActionRow({ title: 'Total Time' });
    stDayGroup.add(stDayTotalRow);

    const stAppsListBox = new Gtk.ListBox({
        css_classes: ['boxed-list'],
        selection_mode: Gtk.SelectionMode.NONE,
        margin_top: 8,
    });
    stDayGroup.add(stAppsListBox);
    page.add(stDayGroup);

    stNav.prevBtn.connect('clicked', () => {
        if (stAvailableDates.length === 0) return;
        const idx = stAvailableDates.indexOf(stSelectedDate);
        const newIdx = (idx < 0) ? 0 : idx + 1;
        if (newIdx < stAvailableDates.length) {
            stSelectedDate = stAvailableDates[newIdx];
            refreshStDayDetail();
        }
    });
    stNav.nextBtn.connect('clicked', () => {
        if (stAvailableDates.length === 0) return;
        const idx = stAvailableDates.indexOf(stSelectedDate);
        const newIdx = (idx < 0) ? 0 : idx - 1;
        if (newIdx >= 0) {
            stSelectedDate = stAvailableDates[newIdx];
            refreshStDayDetail();
        }
    });

    // 4. MOOD SUMMARY
    const moodSummaryGroup = new Adw.PreferencesGroup({
        title: 'Mood',
        description: 'Your emotional patterns over time.',
    });
    const moodDaysRow = new Adw.ActionRow({ title: 'Days Logged' });
    const moodAvgRow = new Adw.ActionRow({ title: 'Average Mood' });
    const moodBestWeekRow = new Adw.ActionRow({ title: 'Best Week' });
    const moodWorstWeekRow = new Adw.ActionRow({ title: 'Most Challenging Week' });
    const moodBestMonthRow = new Adw.ActionRow({ title: 'Best Month' });
    const moodWorstMonthRow = new Adw.ActionRow({ title: 'Most Challenging Month' });
    moodSummaryGroup.add(moodDaysRow);
    moodSummaryGroup.add(moodAvgRow);
    moodSummaryGroup.add(moodBestWeekRow);
    moodSummaryGroup.add(moodWorstWeekRow);
    moodSummaryGroup.add(moodBestMonthRow);
    moodSummaryGroup.add(moodWorstMonthRow);
    page.add(moodSummaryGroup);

    const moodEmptyBox = buildEmptyState(
        'face-smile-big-symbolic',
        'No Mood Data Yet',
        'Log your first mood in the Mood Logger widget to start tracking how you feel.'
    );
    const moodEmptyGroup = new Adw.PreferencesGroup();
    moodEmptyGroup.add(moodEmptyBox);
    page.add(moodEmptyGroup);

    // 5. MOOD DAY DETAIL
    const moodDayGroup = new Adw.PreferencesGroup({
        title: 'Mood Day Detail',
        description: 'Browse your mood entry for each day.',
    });
    const moodNav = buildDayNavRow('Selected Day');
    moodDayGroup.add(moodNav.row);

    const moodStatusRow = new Adw.ActionRow({
        title: 'No Data',
        subtitle: 'No mood logged this day',
    });
    const moodDayIcon = new Gtk.Image({
        icon_name: 'face-plain-symbolic',
        pixel_size: 24,
        valign: Gtk.Align.CENTER,
    });
    moodStatusRow.add_prefix(moodDayIcon);
    moodDayGroup.add(moodStatusRow);
    page.add(moodDayGroup);

    moodNav.prevBtn.connect('clicked', () => {
        if (moodAvailableDates.length === 0) return;
        const idx = moodAvailableDates.indexOf(moodSelectedDate);
        const newIdx = (idx < 0) ? 0 : idx + 1;
        if (newIdx < moodAvailableDates.length) {
            moodSelectedDate = moodAvailableDates[newIdx];
            refreshMoodDayDetail();
        }
    });
    moodNav.nextBtn.connect('clicked', () => {
        if (moodAvailableDates.length === 0) return;
        const idx = moodAvailableDates.indexOf(moodSelectedDate);
        const newIdx = (idx < 0) ? 0 : idx - 1;
        if (newIdx >= 0) {
            moodSelectedDate = moodAvailableDates[newIdx];
            refreshMoodDayDetail();
        }
    });

    // 6. EXPORT DATA
    const exportGroup = new Adw.PreferencesGroup({
        title: 'Export Data',
        description: 'Save your insights data to a JSON file.',
    });
    const exportStBtn = new Adw.ActionRow({
        title: 'Export Screen Time Data',
        activatable: true,
    });
    exportStBtn.connect('activated', () => {
        const exportData = buildScreenTimeExportData(stAvailableDates);
        const json = JSON.stringify(exportData, null, 2);
        const filename = `grid-desktop-screen-time-${todayDateString()}.json`;
        buildExportDialog(page.get_root(), 'Export Screen Time Data', filename, json);
    });
    exportGroup.add(exportStBtn);

    const exportMoodBtn = new Adw.ActionRow({
        title: 'Export Mood Data',
        activatable: true,
    });
    exportMoodBtn.connect('activated', () => {
        const exportData = buildMoodExportData(moodAvailableDates);
        const json = JSON.stringify(exportData, null, 2);
        const filename = `grid-desktop-mood-${todayDateString()}.json`;
        buildExportDialog(page.get_root(), 'Export Mood Data', filename, json);
    });
    exportGroup.add(exportMoodBtn);
    page.add(exportGroup);

    function buildScreenTimeExportData(dates) {
        const days = [];
        let grandTotal = 0;
        const appAgg = {};
        for (const dateStr of dates) {
            const summary = loadDaySummary(dateStr);
            if (summary) {
                grandTotal += summary.totalSeconds;
                for (const app of summary.apps) {
                    if (app.key && !app.key.startsWith('window:'))
                        appAgg[app.key] = (appAgg[app.key] || 0) + app.seconds;
                }
                days.push({
                    date: summary.date,
                    totalSeconds: summary.totalSeconds,
                    apps: summary.apps.map(app => ({
                        id: app.key,
                        name: resolveAppName(app.key),
                        seconds: app.seconds,
                    })),
                });
            }
        }
        const topApps = Object.entries(appAgg)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([id, seconds]) => ({ id, name: resolveAppName(id), seconds }));
        return {
            exported: GLib.DateTime.new_now_local().format('%Y-%m-%dT%H:%M:%S'),
            range: RANGE_PRESETS[selectedRange].label,
            summary: {
                totalDays: dates.length,
                totalSeconds: grandTotal,
                dailyAverageSeconds: dates.length > 0 ? Math.round(grandTotal / dates.length) : 0,
                topApps,
            },
            days,
        };
    }

    function buildMoodExportData(dates) {
        loadDatesSync(dates);
        const entries = [];
        for (const dateStr of dates) {
            const level = getMood(dateStr);
            if (level > 0) {
                const mood = MOOD_LEVELS.find(m => m.level === level);
                entries.push({
                    date: dateStr,
                    level,
                    label: mood ? mood.label : 'Unknown',
                });
            }
        }
        let totalLevel = 0;
        for (const e of entries) totalLevel += e.level;
        const avg = entries.length > 0 ? totalLevel / entries.length : 0;
        const avgMood = MOOD_LEVELS.reduce((prev, curr) =>
            Math.abs(curr.level - avg) < Math.abs(prev.level - avg) ? curr : prev
        );
        return {
            exported: GLib.DateTime.new_now_local().format('%Y-%m-%dT%H:%M:%S'),
            range: RANGE_PRESETS[selectedRange].label,
            summary: {
                totalEntries: entries.length,
                averageLevel: Number(avg.toFixed(2)),
                averageLabel: avgMood.label,
            },
            entries,
        };
    }

    function updateNavButtons() {
        const stHasData = stAvailableDates.length > 0;
        const stIdx = stAvailableDates.indexOf(stSelectedDate);
        stNav.prevBtn.set_sensitive(stHasData && stIdx < stAvailableDates.length - 1);
        stNav.nextBtn.set_sensitive(stHasData && stIdx > 0);

        const moodHasData = moodAvailableDates.length > 0;
        const moodIdx = moodAvailableDates.indexOf(moodSelectedDate);
        moodNav.prevBtn.set_sensitive(moodHasData && moodIdx < moodAvailableDates.length - 1);
        moodNav.nextBtn.set_sensitive(moodHasData && moodIdx > 0);
    }

    function refreshStSummary() {
        const hasData = stAvailableDates.length > 0;
        stDaysRow.set_subtitle(hasData ? `${stAvailableDates.length}` : '0');

        if (!hasData) {
            stTotalRow.set_subtitle('No data yet');
            stAvgRow.set_subtitle('No data yet');
            stTopAppRow.set_subtitle('No data yet');
            stBestRow.set_subtitle('No data yet');
            return;
        }
        let grandTotal = 0;
        const appAgg = {};
        let bestDay = { date: '', total: 0 };
        for (const dateStr of stAvailableDates) {
            const summary = loadDaySummary(dateStr);
            if (summary) {
                grandTotal += summary.totalSeconds;
                for (const app of summary.apps)
                    appAgg[app.key] = (appAgg[app.key] || 0) + app.seconds;
                if (summary.totalSeconds > bestDay.total)
                    bestDay = { date: summary.date, total: summary.totalSeconds };
            }
        }
        stTotalRow.set_subtitle(formatCompactDuration(grandTotal));
        stAvgRow.set_subtitle(formatCompactDuration(Math.round(grandTotal / stAvailableDates.length)));
        const topApp = Object.entries(appAgg).sort((a, b) => b[1] - a[1])[0];
        stTopAppRow.set_subtitle(topApp ? resolveAppName(topApp[0]) : 'None');
        stBestRow.set_subtitle(bestDay.date ? `${formatDateString(bestDay.date)}  ·  ${formatCompactDuration(bestDay.total)}` : 'None');
    }

    function refreshStDayDetail() {
        clearBox(stAppsListBox);
        if (!stSelectedDate) {
            stNav.row.set_subtitle('No data');
            stDayTotalRow.set_subtitle('—');
            stAppsListBox.append(new Adw.ActionRow({ title: 'No data for this day' }));
            updateNavButtons();
            return;
        }
        stNav.row.set_subtitle(formatDateString(stSelectedDate));
        const summary = loadDaySummary(stSelectedDate);
        if (!summary) {
            stDayTotalRow.set_subtitle('—');
            stAppsListBox.append(new Adw.ActionRow({ title: 'No data for this day' }));
            updateNavButtons();
            return;
        }
        stDayTotalRow.set_subtitle(formatCompactDuration(summary.totalSeconds));
        for (const app of summary.apps) {
            const appName = resolveAppName(app.key);
            const pct = summary.totalSeconds > 0 ? Math.round((app.seconds / summary.totalSeconds) * 100) : 0;
            const row = new Adw.ActionRow({
                title: appName,
                subtitle: `${formatCompactDuration(app.seconds)}  ·  ${pct}%`,
            });
            const appInfo = resolveDesktopAppInfo(app.key);
            const gicon = appInfo ? appInfo.get_icon() : null;
            if (gicon) {
                const img = new Gtk.Image({ 
                    gicon, 
                    pixel_size: 24,
                    valign: Gtk.Align.CENTER
                });
                row.add_prefix(img);
            }
            stAppsListBox.append(row);
        }
        updateNavButtons();
    }

    function refreshMoodSummary() {
        const hasData = moodAvailableDates.length > 0;
        moodDaysRow.set_subtitle(hasData ? `${moodAvailableDates.length}` : '0');

        if (!hasData) {
            moodAvgRow.set_subtitle('No data yet');
            moodBestWeekRow.set_subtitle('No data yet');
            moodWorstWeekRow.set_subtitle('No data yet');
            moodBestMonthRow.set_subtitle('No data yet');
            moodWorstMonthRow.set_subtitle('No data yet');
            return;
        }
        loadDatesSync(moodAvailableDates);
        let totalLevel = 0;
        let loggedCount = 0;
        const weekScores = {};
        const monthScores = {};
        for (const dateStr of moodAvailableDates) {
            const level = getMood(dateStr);
            if (level <= 0) continue;
            totalLevel += level;
            loggedCount++;
            const [y, m, d] = dateStr.split('-').map(Number);
            const dt = GLib.DateTime.new_local(y, m, d, 12, 0, 0);
            const weekKey = `${dt.get_year()}-W${dt.get_week_of_year().toString().padStart(2, '0')}`;
            const monthKey = `${dt.get_year()}-${dt.get_month().toString().padStart(2, '0')}`;
            if (!weekScores[weekKey]) weekScores[weekKey] = { total: 0, count: 0 };
            weekScores[weekKey].total += level;
            weekScores[weekKey].count++;
            if (!monthScores[monthKey]) monthScores[monthKey] = { total: 0, count: 0 };
            monthScores[monthKey].total += level;
            monthScores[monthKey].count++;
        }
        if (loggedCount === 0) {
            moodAvgRow.set_subtitle('No entries yet');
            moodBestWeekRow.set_subtitle('No entries yet');
            moodWorstWeekRow.set_subtitle('No entries yet');
            moodBestMonthRow.set_subtitle('No entries yet');
            moodWorstMonthRow.set_subtitle('No entries yet');
            return;
        }
        const avg = totalLevel / loggedCount;
        const avgMood = MOOD_LEVELS.reduce((prev, curr) => Math.abs(curr.level - avg) < Math.abs(prev.level - avg) ? curr : prev);
        moodAvgRow.set_subtitle(`${avgMood.label}  ·  ${avg.toFixed(1)}/5`);

        const weekEntries = Object.entries(weekScores).sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count));
        if (weekEntries.length > 0) {
            const [bestWeek, bestData] = weekEntries[0];
            const bestAvg = bestData.total / bestData.count;
            const bestMood = MOOD_LEVELS.reduce((prev, curr) => Math.abs(curr.level - bestAvg) < Math.abs(prev.level - bestAvg) ? curr : prev);
            moodBestWeekRow.set_subtitle(`${bestWeek}  ·  ${bestMood.label} (${bestAvg.toFixed(1)})`);
            const [worstWeek, worstData] = weekEntries[weekEntries.length - 1];
            const worstAvg = worstData.total / worstData.count;
            const worstMood = MOOD_LEVELS.reduce((prev, curr) => Math.abs(curr.level - worstAvg) < Math.abs(prev.level - worstAvg) ? curr : prev);
            moodWorstWeekRow.set_subtitle(`${worstWeek}  ·  ${worstMood.label} (${worstAvg.toFixed(1)})`);
        } else {
            moodBestWeekRow.set_subtitle('Not enough data');
            moodWorstWeekRow.set_subtitle('Not enough data');
        }

        const monthEntries = Object.entries(monthScores).sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count));
        if (monthEntries.length > 0) {
            const [bestMonth, bestData] = monthEntries[0];
            const bestAvg = bestData.total / bestData.count;
            const bestMood = MOOD_LEVELS.reduce((prev, curr) => Math.abs(curr.level - bestAvg) < Math.abs(prev.level - bestAvg) ? curr : prev);
            moodBestMonthRow.set_subtitle(`${bestMonth}  ·  ${bestMood.label} (${bestAvg.toFixed(1)})`);
            const [worstMonth, worstData] = monthEntries[monthEntries.length - 1];
            const worstAvg = worstData.total / worstData.count;
            const worstMood = MOOD_LEVELS.reduce((prev, curr) => Math.abs(curr.level - worstAvg) < Math.abs(prev.level - worstAvg) ? curr : prev);
            moodWorstMonthRow.set_subtitle(`${worstMonth}  ·  ${worstMood.label} (${worstAvg.toFixed(1)})`);
        } else {
            moodBestMonthRow.set_subtitle('Not enough data');
            moodWorstMonthRow.set_subtitle('Not enough data');
        }
    }

    function refreshMoodDayDetail() {
        if (!moodSelectedDate) {
            moodNav.row.set_subtitle('No data');
            moodDayIcon.set_from_icon_name('face-plain-symbolic');
            moodStatusRow.set_title('No Data');
            moodStatusRow.set_subtitle('No mood logged this day');
            for (const cls of moodDayIcon.get_css_classes()) {
                if (cls.startsWith('mood-level-') || cls === 'mood-none')
                    moodDayIcon.remove_css_class(cls);
            }
            moodDayIcon.add_css_class('mood-none');
            updateNavButtons();
            return;
        }
        moodNav.row.set_subtitle(formatDateString(moodSelectedDate));
        loadDatesSync([moodSelectedDate]);
        for (const cls of moodDayIcon.get_css_classes()) {
            if (cls.startsWith('mood-level-') || cls === 'mood-none')
                moodDayIcon.remove_css_class(cls);
        }
        const level = getMood(moodSelectedDate);
        if (level > 0) {
            const mood = MOOD_LEVELS.find(m => m.level === level);
            moodDayIcon.set_from_icon_name(mood.icon);
            moodDayIcon.add_css_class(`mood-level-${mood.level}`);
            moodStatusRow.set_title(mood.label);
            moodStatusRow.set_subtitle(`Level ${level}/5`);
        } else {
            moodDayIcon.set_from_icon_name('face-plain-symbolic');
            moodDayIcon.add_css_class('mood-none');
            moodStatusRow.set_title('No Entry');
            moodStatusRow.set_subtitle('No mood logged this day');
        }
        updateNavButtons();
    }

    function refreshAll() {
        const allFiles = listDayFiles();
        stAvailableDates = filterByRange(allFiles, selectedRange);
        if (stAvailableDates.length > 0) {
            if (!stSelectedDate || !stAvailableDates.includes(stSelectedDate))
                stSelectedDate = stAvailableDates[0];
        } else {
            stSelectedDate = '';
        }

        const hasStData = stAvailableDates.length > 0;
        stEmptyGroup.set_visible(!hasStData);
        stDayGroup.set_visible(hasStData);

        refreshStSummary();
        refreshStDayDetail();

        const allMoodDates = listMoodDatesSync();
        moodAvailableDates = filterByRange(allMoodDates, selectedRange);
        if (moodAvailableDates.length > 0) {
            if (!moodSelectedDate || !moodAvailableDates.includes(moodSelectedDate))
                moodSelectedDate = moodAvailableDates[0];
        } else {
            moodSelectedDate = '';
        }

        const hasMoodData = moodAvailableDates.length > 0;
        moodEmptyGroup.set_visible(!hasMoodData);
        moodDayGroup.set_visible(hasMoodData);

        refreshMoodSummary();
        refreshMoodDayDetail();
    }

    refreshAll();
    return page;
}

function clearAllScreenTimeData(callback) {
    const dir = getGridgetsDataDir('screen-time');
    const dirFile = Gio.File.new_for_path(dir);
    dirFile.enumerate_children_async(
        'standard::name',
        Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT,
        null,
        (sourceObj, res) => {
            try {
                const enumerator = sourceObj.enumerate_children_finish(res);
                let info;
                while ((info = enumerator.next_file(null)) !== null) {
                    const name = info.get_name();
                    if (name.endsWith('.json')) {
                        const file = Gio.File.new_for_path(GLib.build_filenamev([dir, name]));
                        file.delete(null);
                    }
                }
            } catch (e) {
                console.error('Error clearing screen time data:', e);
            }
            if (callback) callback();
        }
    );
}