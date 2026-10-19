import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';

import {
    resolveWidgetForegroundColor,
    resolveExplicitFontFamily,
    cssColorToRgba,
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
const ITEM_IDLE_ALPHA = 0.06;
const ITEM_HOVER_ALPHA = 0.12;

const REF_WIDTH_PX = 220;
const REF_HEIGHT_PX = 220;

export function createMailGoaNode(config, width, height, xPosition, yPosition) {
    const fontFamily = resolveExplicitFontFamily(config) || 'Sans';
    const fontCss = fontFamily ? `font-family: ${fontFamily}; ` : '';
    const textColor = resolveWidgetForegroundColor(config);
    const textRgba = (alpha) => cssColorToRgba(textColor, alpha);

    const container = createWidgetContainer(config, width, height, xPosition, yPosition);
    container.style += ` border: 1px solid ${textRgba(BORDER_ALPHA)};`;

    let currentScale = Math.min(width / REF_WIDTH_PX, height / REF_HEIGHT_PX);

    const mainLayout = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_expand: true,
    });
    container.add_child(mainLayout);

    // ─────────────────────────────────────────────────────────────
    // 1. KOMPAKT NÉZET (2x2 / 3x3)
    // ─────────────────────────────────────────────────────────────
    const compactBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_expand: true,
    });

    const topBox = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        x_align: Clutter.ActorAlign.END,
        x_expand: true,
    });

    const iconBadge = new St.Bin({
        y_align: Clutter.ActorAlign.CENTER,
    });
    const topIcon = new St.Icon({
        icon_name: 'mail-unread-symbolic',
        style: `color: ${textColor}; opacity: 0.9;`,
    });
    iconBadge.set_child(topIcon);
    topBox.add_child(iconBadge);
    compactBox.add_child(topBox);

    const bottomBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        y_align: Clutter.ActorAlign.END,
        y_expand: true,
    });

    const unreadCountLabel = new St.Label({
        text: '0',
        style: `${fontCss}color: ${textColor}; font-weight: bold; line-height: 1.1;`,
    });

    const subLabel = new St.Label({
        text: 'MAIL',
        style: `${fontCss}color: ${textColor}; opacity: ${SUB_LABEL_OPACITY}; font-weight: 500;`,
    });

    bottomBox.add_child(unreadCountLabel);
    bottomBox.add_child(subLabel);
    compactBox.add_child(bottomBox);

    // ─────────────────────────────────────────────────────────────
    // 2. LISTA NÉZET (4x4+)
    // ─────────────────────────────────────────────────────────────
    const scrollView = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: true,
        x_expand: true,
        y_expand: true,
    });

    const itemContainer = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
    });
    scrollView.set_child(itemContainer);

    let currentAccounts = [];

    const renderMailItems = () => {
        if (isActorDestroyed(container)) return;
        itemContainer.destroy_all_children();

        const itemFontSize = Math.max(10, Math.round(12 * currentScale));

        if (currentAccounts.length === 0) {
            const emptyLabel = new St.Label({
                text: 'Nincs beérkező levél',
                style: `${fontCss}color: ${textColor}; opacity: ${SECONDARY_OPACITY}; font-size: ${itemFontSize}px;`,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true,
            });
            itemContainer.add_child(emptyLabel);
            return;
        }

        const itemRadius = Math.max(4, Math.round(8 * currentScale));
        const padV = Math.max(4, Math.round(6 * currentScale));
        const padH = Math.max(6, Math.round(9 * currentScale));
        const gap = Math.max(3, Math.round(5 * currentScale));

        const itemNormalStyle = `padding: ${padV}px ${padH}px; margin-bottom: ${gap}px; border-radius: ${itemRadius}px; `
            + `background-color: ${textRgba(ITEM_IDLE_ALPHA)}; border: 1px solid ${textRgba(0.06)};`;

        currentAccounts.forEach((acc, idx) => {
            const card = new St.Button({
                reactive: true,
                can_focus: true,
                x_expand: true,
                style: itemNormalStyle,
            });

            const row = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                x_expand: true,
            });

            const nameLabel = new St.Label({
                text: `Fiók #${idx + 1}`,
                style: `${fontCss}color: ${textColor}; font-weight: bold; font-size: ${itemFontSize}px;`,
                x_expand: true,
            });

            const countBadge = new St.Label({
                text: `${acc.unread || 0}`,
                style: `${fontCss}color: ${textColor}; font-weight: bold; font-size: ${itemFontSize}px; opacity: ${acc.unread > 0 ? '1.0' : '0.4'};`,
            });

            row.add_child(nameLabel);
            row.add_child(countBadge);
            card.set_child(row);

            card.connect('clicked', () => {
                try {
                    Gio.AppInfo.launch_default_for_uri('mailto:', null);
                } catch (e) {}
            });

            itemContainer.add_child(card);
        });
    };

    // ─────────────────────────────────────────────────────────────
    // Méretezés
    // ─────────────────────────────────────────────────────────────
    const isCompact = (width < 180 || height < 180);

    if (isCompact) {
        mainLayout.add_child(compactBox);

        const scale = Math.max(0.65, Math.min(width / 110, height / 110));
        const padding = Math.max(8, Math.round(12 * scale));
        const badgeIconSize = Math.max(13, Math.round(15 * scale));
        const badgePadding = Math.max(3, Math.round(5 * scale));
        const badgeRadius = Math.max(6, Math.round(7 * scale));
        const percentFontSize = Math.max(16, Math.round(22 * scale));
        const labelFontSize = Math.max(10, Math.round(12 * scale));

        mainLayout.style = `padding: ${padding}px; spacing: ${Math.round(6 * scale)}px;`;

        const badgeBg = textRgba(BADGE_BG_ALPHA);
        iconBadge.style = `background-color: ${badgeBg}; border-radius: ${badgeRadius}px; padding: ${badgePadding}px;`;
        topIcon.icon_size = badgeIconSize;

        unreadCountLabel.style = `${fontCss}color: ${textColor}; font-size: ${percentFontSize}px; font-weight: bold; line-height: 1.1;`;
        subLabel.style = `${fontCss}color: ${textColor}; font-size: ${labelFontSize}px; opacity: ${SUB_LABEL_OPACITY}; font-weight: 500;`;
    } else {
        mainLayout.add_child(scrollView);

        currentScale = Math.min(width / REF_WIDTH_PX, height / REF_HEIGHT_PX);
        const padding = Math.max(8, Math.round(12 * currentScale));
        mainLayout.style = `padding: ${padding}px; spacing: ${Math.round(6 * currentScale)}px;`;

        renderMailItems();
    }

    // ─────────────────────────────────────────────────────────────
    // Feliratkozás a MailEngine-re
    // ─────────────────────────────────────────────────────────────
    const unsubscribe = mailEngine.subscribe((data) => {
        if (isActorDestroyed(container)) return;

        unreadCountLabel.set_text(`${data.unreadTotal}`);
        currentAccounts = data.accounts || [];

        if (!isCompact) {
            renderMailItems();
        }
    });

    registerWidgetCleanup(container, () => {
        unsubscribe();
    });

    return container;
}