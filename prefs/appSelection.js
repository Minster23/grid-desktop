import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Pango from 'gi://Pango';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { MAX_APP_LAUNCHER_ITEMS, normalizeAppLauncherApps } from '../utils/widgetUtils.js';
import { clearBox } from './displayUtils.js';

const MAX_RENDERED_APP_ROWS = 80;

let cachedDesktopApplications = null;

function getDesktopApplications() {
    if (cachedDesktopApplications) return cachedDesktopApplications;

    const applications = [];
    const seenIds = new Set();
    for (const appInfo of Gio.AppInfo.get_all()) {
        const appId = appInfo.get_id();
        if (!appId || seenIds.has(appId) || !appInfo.should_show()) continue;
        seenIds.add(appId);
        applications.push({
            id: appId,
            name: appInfo.get_display_name() || appInfo.get_name() || appId,
            description: appInfo.get_description() || '',
            icon: appInfo.get_icon() || null,
        });
    }

    applications.sort((a, b) => a.name.localeCompare(b.name));
    cachedDesktopApplications = applications;
    return cachedDesktopApplications;
}

function setAppSelectionSummary(summaryLabel, helperLabel, selectedApps, statusMessage = '') {
    const selectedEntries = [...selectedApps.values()];
    const selectedNames = selectedEntries.slice(0, 4).map(app => app.name);
    const extraCount = selectedEntries.length - selectedNames.length;
    const previewText = selectedNames.length > 0
        ? `${selectedNames.join(', ')}${extraCount > 0 ? ` +${extraCount} more` : ''}`
        : 'None';

    summaryLabel.set_markup(
        `<span size='small' weight='bold'>Selected (${selectedEntries.length}/${MAX_APP_LAUNCHER_ITEMS}): ${GLib.markup_escape_text(previewText, -1)}</span>`
    );

    const helperText = statusMessage || `Choose up to ${MAX_APP_LAUNCHER_ITEMS} applications.`;
    helperLabel.set_markup(
        `<span size='x-small' alpha='70%'>${GLib.markup_escape_text(helperText, -1)}</span>`
    );
}

export function createAppSelectionControls(container, defaultApps = []) {
    const selectedApps = new Map(
        normalizeAppLauncherApps(defaultApps).map(app => [app.id, app])
    );

    const group = new Adw.PreferencesGroup({
        title: 'Applications',
    });

    const searchEntryRow = new Adw.EntryRow({
        title: 'Search installed applications...',
        show_apply_button: false,
    });
    group.add(searchEntryRow);

    const summaryLabel = new Gtk.Label({
        xalign: 0,
        wrap: true,
        wrap_mode: Pango.WrapMode.WORD,
        margin_top: 6,
        margin_start: 6,
    });

    const helperLabel = new Gtk.Label({
        xalign: 0,
        wrap: true,
        wrap_mode: Pango.WrapMode.WORD,
        margin_bottom: 6,
        margin_start: 6,
    });

    group.add(summaryLabel);
    group.add(helperLabel);

    const resultsListBox = new Gtk.ListBox({
        css_classes: ['boxed-list'],
        selection_mode: Gtk.SelectionMode.NONE,
    });

    const scrolledWindow = new Gtk.ScrolledWindow({
        max_content_height: 340,
        min_content_height: 220,
        propagate_natural_height: true,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    });
    scrolledWindow.set_child(resultsListBox);
    group.add(scrolledWindow);

    container.append ? container.append(group) : container.add(group);

    const desktopApplications = getDesktopApplications();

    const renderAppRows = () => {
        clearBox(resultsListBox);

        const query = searchEntryRow.get_text().trim().toLowerCase();
        const filteredApps = desktopApplications
            .filter(app => {
                if (query === '') return true;
                const haystacks = [app.name, app.description, app.id]
                    .filter(Boolean)
                    .map(value => value.toLowerCase());
                return haystacks.some(value => value.includes(query));
            })
            .slice(0, MAX_RENDERED_APP_ROWS);

        if (filteredApps.length === 0) {
            const emptyRow = new Adw.ActionRow({
                title: 'No matching applications found.',
            });
            resultsListBox.append(emptyRow);
            return;
        }

        for (const app of filteredApps) {
            const actionRow = new Adw.ActionRow({
                title: app.name,
                subtitle: app.description || app.id,
                subtitle_lines: 1,
                activatable: true,
            });

            if (app.icon) {
                const icon = new Gtk.Image({
                    gicon: app.icon,
                    pixel_size: 24,
                    valign: Gtk.Align.CENTER,
                });
                actionRow.add_prefix(icon);
            }

            const checkBtn = new Gtk.CheckButton({
                active: selectedApps.has(app.id),
                valign: Gtk.Align.CENTER,
            });
            actionRow.add_suffix(checkBtn);
            actionRow.set_activatable_widget(checkBtn);

            let isInternalToggle = false;
            checkBtn.connect('toggled', () => {
                if (isInternalToggle) return;

                const shouldSelect = checkBtn.get_active();
                if (shouldSelect) {
                    if (!selectedApps.has(app.id) && selectedApps.size >= MAX_APP_LAUNCHER_ITEMS) {
                        isInternalToggle = true;
                        checkBtn.set_active(false);
                        isInternalToggle = false;
                        setAppSelectionSummary(summaryLabel, helperLabel, selectedApps, `Maximum ${MAX_APP_LAUNCHER_ITEMS} applications allowed.`);
                        return;
                    }
                    selectedApps.set(app.id, app);
                } else {
                    selectedApps.delete(app.id);
                }
                setAppSelectionSummary(summaryLabel, helperLabel, selectedApps);
            });

            resultsListBox.append(actionRow);
        }
    };

    searchEntryRow.connect('notify::text', renderAppRows);
    setAppSelectionSummary(summaryLabel, helperLabel, selectedApps);
    renderAppRows();

    return {
        getSelectedApps: () => [...selectedApps.values()],
    };
}