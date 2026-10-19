import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';

import {
    resolveWidgetForegroundColor,
    resolveExplicitFontFamily,
    resolveWidgetBackgroundColor,
    cssColorToRgba,
    isDarkBackgroundColor,
    SECONDARY_OPACITY,
} from '../utils/widgetUtils.js';
import {
    createWidgetContainer,
    registerWidgetCleanup,
} from '../shell/widgetUIUtils.js';
import { isActorDestroyed } from '../utils/actorLifecycle.js';
import { mailEngine } from '../utils/mailEngine.js';

const BORDER_ALPHA = 0.14;
const BADGE_BG_ALPHA = 0.12;
const SUB_LABEL_OPACITY = 0.65;
const CARD_BG_DARK_ALPHA = 0.05;
const CARD_BG_LIGHT_ALPHA = 0.04;
const CARD_BORDER_DARK_ALPHA = 0.06;
const CARD_BORDER_LIGHT_ALPHA = 0.10;

export function createMailGoaNode(config, width, height, xPosition, yPosition) {
    const fontFamily = resolveExplicitFontFamily(config) || 'Sans';
    const fontCss = fontFamily ? `font-family: ${fontFamily}; ` : '';
    const textColor = resolveWidgetForegroundColor(config);
    const textRgba = (alpha) => cssColorToRgba(textColor, alpha);

    const container = createWidgetContainer(config, width, height, xPosition, yPosition);
    container.style += ` border: 1px solid ${textRgba(BORDER_ALPHA)};`;

    const isDarkSurface = isDarkBackgroundColor(resolveWidgetBackgroundColor(config));
    const cardBgAlpha = isDarkSurface ? CARD_BG_DARK_ALPHA : CARD_BG_LIGHT_ALPHA;
    const cardBorderAlpha = isDarkSurface ? CARD_BORDER_DARK_ALPHA : CARD_BORDER_LIGHT_ALPHA;

    // A váltás határa: ~125px (így 30-34px-es rács esetén a 4x4 már a nagy lista nézet)
    const isCompact = (width < 125 || height < 125);

    // ─────────────────────────────────────────────────────────────
    // 1. KOMPAKT NÉZET (2x2 / 3x3)
    // ─────────────────────────────────────────────────────────────
    if (isCompact) {
        const scale = Math.max(0.65, Math.min(width / 110, height / 110));
        const padding = Math.max(8, Math.round(12 * scale));
        const badgeIconSize = Math.max(13, Math.round(15 * scale));
        const badgePadding = Math.max(3, Math.round(5 * scale));
        const badgeRadius = Math.max(6, Math.round(7 * scale));
        const percentFontSize = Math.max(16, Math.round(22 * scale));
        const labelFontSize = Math.max(10, Math.round(12 * scale));

        const compactLayout = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
            style: `padding: ${padding}px; spacing: ${Math.round(6 * scale)}px;`,
        });
        container.add_child(compactLayout);

        // Jobb felső badge + ikon
        const topBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });

        const iconBadge = new St.Bin({
            y_align: Clutter.ActorAlign.CENTER,
            style: `background-color: ${textRgba(BADGE_BG_ALPHA)}; border-radius: ${badgeRadius}px; padding: ${badgePadding}px;`,
        });

        const topIcon = new St.Icon({
            icon_name: 'mail-unread-symbolic',
            icon_size: badgeIconSize,
            style: `color: ${textColor}; opacity: 0.9;`,
        });
        iconBadge.set_child(topIcon);
        topBox.add_child(iconBadge);
        compactLayout.add_child(topBox);

        // Bal alsó szám + felirat
        const bottomBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.END,
            y_expand: true,
        });

        const unreadCountLabel = new St.Label({
            text: '0',
            style: `${fontCss}color: ${textColor}; font-size: ${percentFontSize}px; font-weight: bold; line-height: 1.1;`,
        });

        const subLabel = new St.Label({
            text: 'MAIL',
            style: `${fontCss}color: ${textColor}; font-size: ${labelFontSize}px; opacity: ${SUB_LABEL_OPACITY}; font-weight: 500;`,
        });

        bottomBox.add_child(unreadCountLabel);
        bottomBox.add_child(subLabel);
        compactLayout.add_child(bottomBox);

        // Kattintásra levelező indítása
        iconBadge.reactive = true;
        iconBadge.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                try {
                    Gio.AppInfo.launch_default_for_uri('mailto:', null);
                } catch (e) {}
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        const unsubscribe = mailEngine.subscribe((data) => {
            if (isActorDestroyed(container)) return;
            unreadCountLabel.set_text(`${data.unreadTotal}`);
        });

        registerWidgetCleanup(container, () => unsubscribe());
        return container;
    }

    // ─────────────────────────────────────────────────────────────
    // 2. LARGE NÉZET (4x4+) – Szabványos Fejléccel és Listával
    // ─────────────────────────────────────────────────────────────
    const scale = Math.max(0.65, Math.min(width / 200, height / 200));
    const titleFontSize = Math.max(10, Math.round(12 * scale));
    const deviceFontSize = Math.max(10, Math.round(12 * scale));
    const cardPadding = Math.max(4, Math.round(6 * scale));
    const cardRadius = Math.max(6, Math.round(8 * scale));
    const rowGap = Math.max(3, Math.round(5 * scale));

    const contentBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_expand: true,
        style: `padding: ${Math.max(6, Math.round(8 * scale))}px; spacing: ${Math.max(4, Math.round(6 * scale))}px;`,
    });
    container.add_child(contentBox);

    // Szabványos Fejléc (Audio Output / Battery Status stílus)
    const headerBox = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: true,
        style: `margin-bottom: ${Math.round(4 * scale)}px;`,
    });

    const headerIcon = new St.Icon({
        icon_name: 'mail-unread-symbolic',
        icon_size: Math.round(15 * scale),
        style: `color: ${textColor}; margin-right: 6px;`,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const headerLabel = new St.Label({
        text: 'Unread Mail',
        style: `${fontCss}color: ${textColor}; font-size: ${titleFontSize}px; font-weight: bold; opacity: 0.9;`,
        y_align: Clutter.ActorAlign.CENTER,
    });
    headerLabel.clutter_text.set_ellipsize(0);

    headerBox.add_child(headerIcon);
    headerBox.add_child(headerLabel);
    contentBox.add_child(headerBox);

    // Gördülő lista
    const scrollView = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: false,
        x_expand: true,
        y_expand: true,
    });
    contentBox.add_child(scrollView);

    const listContainer = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        style: `spacing: ${rowGap}px;`,
    });
    scrollView.set_child(listContainer);

    let lastAccounts = [];

    const renderList = () => {
        if (isActorDestroyed(container)) return;
        listContainer.destroy_all_children();

        if (lastAccounts.length === 0) {
            const emptyLabel = new St.Label({
                text: 'Nincs elérhető fiók',
                style: `${fontCss}color: ${textColor}; font-size: ${deviceFontSize}px; opacity: ${SECONDARY_OPACITY};`,
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true,
            });
            listContainer.add_child(emptyLabel);
            return;
        }

        const cardBg = textRgba(cardBgAlpha);
        const cardBorder = textRgba(cardBorderAlpha);
        const itemCardStyle = `background-color: ${cardBg}; border: 1px solid ${cardBorder}; border-radius: ${cardRadius}px; padding: ${cardPadding}px;`;

        lastAccounts.forEach((acc) => {
            const rowBtn = new St.Button({
                reactive: true,
                can_focus: true,
                x_expand: true,
                style: itemCardStyle,
            });

            const row = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const nameLabel = new St.Label({
                text: acc.name,
                style: `${fontCss}color: ${textColor}; font-size: ${deviceFontSize}px; font-weight: 500;`,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            nameLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);

            const countBadge = new St.Label({
                text: `${acc.unread || 0}`,
                style: `${fontCss}color: ${textColor}; font-weight: bold; font-size: ${deviceFontSize}px; opacity: ${acc.unread > 0 ? '1.0' : '0.4'};`,
                y_align: Clutter.ActorAlign.CENTER,
            });

            row.add_child(nameLabel);
            row.add_child(countBadge);
            rowBtn.set_child(row);

            rowBtn.connect('clicked', () => {
                try {
                    Gio.AppInfo.launch_default_for_uri('mailto:', null);
                } catch (e) {}
            });

            listContainer.add_child(rowBtn);
        });
    };

    const unsubscribe = mailEngine.subscribe((data) => {
        if (isActorDestroyed(container)) return;
        lastAccounts = data.accounts || [];
        renderList();
    });

    registerWidgetCleanup(container, () => {
        unsubscribe();
    });

    return container;
}