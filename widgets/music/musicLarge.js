import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { resolveExplicitFontFamily } from '../../utils/widgetUtils.js';
import { buildControlsColumn, updateControlButtonScaling } from './controls.js';
import { resolveMusicPanelColors, resolveArtworkLayerStyle } from './cover.js';
import { attachResponsiveScaler } from '../../shell/widgetUIUtils.js';
import { isActorDestroyed } from '../../utils/actorLifecycle.js';

const BASE_CONTAINER_WIDTH = 480;
const BASE_CONTAINER_HEIGHT = 240;

const BASE_PADDING = 24;
const BASE_TITLE_FONT_SIZE = 24;
const BASE_ARTIST_FONT_SIZE = 18;
const BASE_ALBUM_FONT_SIZE = 18;
const LABEL_MARGIN_BOTTOM_PX = 4;

// Alapméretek 240px magas widgetre kalkulálva
const BASE_VINYL_SIZE = 190;
const BASE_CENTER_LABEL_SIZE = 86;
const BASE_ARM_WIDTH = 46;
const BASE_ARM_HEIGHT = 120;

function getAssetPath(filename) {
    const currentFilePath = Gio.File.new_for_uri(import.meta.url).get_path();
    const currentDir = GLib.path_get_dirname(currentFilePath);
    return GLib.build_filenamev([currentDir, '..', '..', 'assets', filename]);
}

export function buildLargeLayout(config, state, width) {
    const cornerRadius = config.appliedBorderRadius || 0;
    const scale = config.layoutScale || 1;
    const fontFamily = resolveExplicitFontFamily(config);
    const fontCss = fontFamily ? `font-family: ${fontFamily}; ` : '';
    const { panelColor, textColor } = resolveMusicPanelColors(config, state);
    const halfWidth = Math.floor(width / 2);

    const splitContainer = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: true,
        y_expand: true,
        style: `background-color: ${panelColor}; border-radius: ${cornerRadius}px;`,
    });

    const imagePanel = new St.Widget({
        x_expand: false,
        y_expand: true,
        width: halfWidth,
        style: `background-color: ${panelColor}; border-top-left-radius: ${cornerRadius}px; border-bottom-left-radius: ${cornerRadius}px;`,
    });
    state.backgroundLayer = imagePanel;

    // --- VINYL ELEMEK INICIALIZÁLÁSA ---
    let spinTransition = null;
    let turntableBox = null;
    let discActor = null;
    let vinylCoverActor = null;
    let vinylTexture = null;
    let sheenActor = null;
    let armActor = null;

    if (config.vinylStyle === true) {
        turntableBox = new St.Widget({
            x_expand: true,
            y_expand: true,
        });

        discActor = new St.Widget({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        discActor.set_pivot_point(0.5, 0.5);

        vinylCoverActor = new St.Widget({
            style: 'border-radius: 999px; background-color: #1a1a1a;',
        });
        state.vinylCoverActor = vinylCoverActor;

        const vinylSvgPath = getAssetPath('vinyl.svg');
        vinylTexture = new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(vinylSvgPath)),
        });

        discActor.add_child(vinylCoverActor);
        discActor.add_child(vinylTexture);

        const sheenSvgPath = getAssetPath('vinyl_sheen.svg');
        sheenActor = new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(sheenSvgPath)),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
        });

        const armSvgPath = getAssetPath('tonearm.svg');
        const armUrl = Gio.File.new_for_path(armSvgPath).get_uri();
        armActor = new St.Widget({
            style: `background-image: url("${armUrl}"); background-size: contain; background-repeat: no-repeat;`,
            reactive: false,
        });
        armActor.set_pivot_point(25 / 70, 25 / 180);
        armActor.rotation_angle_z = 0;

        turntableBox.add_child(discActor);
        turntableBox.add_child(sheenActor);
        turntableBox.add_child(armActor);
        imagePanel.add_child(turntableBox);

        let spinTimerId = null;

        const startSpinning = () => {
            if (spinTimerId) return;
            spinTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 33, () => {
                if (!discActor || isActorDestroyed(discActor)) {
                    spinTimerId = null;
                    return GLib.SOURCE_REMOVE;
                }
                discActor.rotation_angle_z = (discActor.rotation_angle_z + 2.0) % 360;
                return GLib.SOURCE_CONTINUE;
            });
        };

        const stopSpinning = () => {
            if (spinTimerId) {
                GLib.Source.remove(spinTimerId);
                spinTimerId = null;
            }
        };

        // Takarítás a widget megsemmisülésekor (hogy ne maradjon árva időzítő)
        discActor.connect('destroy', () => {
            stopSpinning();
        });

        state.onPlaybackStatusChanged = (status) => {
            if (!discActor || isActorDestroyed(discActor)) return;

            const isMapped = discActor.is_mapped() && discActor.get_stage() !== null;

            if (status === 'Playing') {
                if (isMapped) {
                    startSpinning();
                    if (armActor) {
                        armActor.ease({
                            rotation_angle_z: 22,
                            duration: 500,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    }
                } else {
                    if (armActor) armActor.rotation_angle_z = 22;
                }
            } else {
                stopSpinning();
                if (isMapped) {
                    if (armActor) {
                        armActor.ease({
                            rotation_angle_z: 0,
                            duration: 500,
                            mode: Clutter.AnimationMode.EASE_IN_QUAD,
                        });
                    }
                } else {
                    if (armActor) armActor.rotation_angle_z = 0;
                }
            }
        };

        discActor.connect('notify::mapped', () => {
            if (discActor.is_mapped() && discActor.get_stage() !== null) {
                if (state.playbackStatus === 'Playing') {
                    startSpinning();
                }
            } else {
                stopSpinning();
            }
        });
    }

    // --- JOBB OLDALI PANEL (Szövegek, Gombok) ---
    const infoPanel = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: false,
        y_expand: true,
        width: halfWidth,
        x_align: Clutter.ActorAlign.CENTER,
        style: `padding: ${Math.floor(BASE_PADDING * scale)}px;`,
    });

    const labelsSection = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const titleLabel = new St.Label({
        text: 'Not Playing',
        x_align: Clutter.ActorAlign.CENTER,
        style: `${fontCss}color: ${textColor}; font-size: ${Math.floor(BASE_TITLE_FONT_SIZE * scale)}px; `
            + `font-weight: 400; margin-bottom: ${Math.floor(LABEL_MARGIN_BOTTOM_PX * scale)}px;`,
    });
    const artistLabel = new St.Label({
        text: 'Unknown Artist',
        x_align: Clutter.ActorAlign.CENTER,
        style: `${fontCss}color: ${textColor}; opacity: 0.8; font-size: ${Math.floor(BASE_ARTIST_FONT_SIZE * scale)}px; `
            + `margin-bottom: ${Math.floor(LABEL_MARGIN_BOTTOM_PX * scale)}px;`,
    });
    const albumLabel = new St.Label({
        text: '',
        x_align: Clutter.ActorAlign.CENTER,
        style: `${fontCss}color: ${textColor}; opacity: 0.6; font-size: ${Math.floor(BASE_ALBUM_FONT_SIZE * scale)}px; `
            + `margin-bottom: ${Math.floor(LABEL_MARGIN_BOTTOM_PX * scale)}px;`,
    });

    state.titleLabel = titleLabel;
    state.artistLabel = artistLabel;
    state.albumLabel = albumLabel;

    labelsSection.add_child(titleLabel);
    labelsSection.add_child(artistLabel);
    labelsSection.add_child(albumLabel);

    const controlsBox = buildControlsColumn(config, state);

    infoPanel.add_child(labelsSection);
    if (controlsBox) infoPanel.add_child(controlsBox);

    splitContainer.add_child(imagePanel);
    splitContainer.add_child(infoPanel);
    state.container.add_child(splitContainer);

    // --- RESPONSIVE SKÁLÁZÁS KEZELŐJE (Small, Medium, Large) ---
    const applyLayoutStyles = (scalerRatio, currentWidth, currentHeight) => {
        const colors = resolveMusicPanelColors(config, state);
        const newHalfWidth = Math.floor(currentWidth / 2);
        imagePanel.set_width(newHalfWidth);
        infoPanel.set_width(newHalfWidth);

        const titleSize = Math.max(1, Math.floor(BASE_TITLE_FONT_SIZE * scalerRatio));
        const artistSize = Math.max(1, Math.floor(BASE_ARTIST_FONT_SIZE * scalerRatio));
        const albumSize = Math.max(1, Math.floor(BASE_ALBUM_FONT_SIZE * scalerRatio));
        const padding = Math.max(1, Math.floor(BASE_PADDING * scalerRatio));

        splitContainer.style = `background-color: ${colors.panelColor}; border-radius: ${cornerRadius}px;`;
        infoPanel.style = `padding: ${padding}px;`;

        if (config.vinylStyle !== true) {
            imagePanel.style = resolveArtworkLayerStyle(state)
                + ` background-color: ${colors.panelColor};`;
        } else if (turntableBox) {
            // A lemez dinamikus méretezése és középre pozicionálása
            const vinylSize = Math.round(BASE_VINYL_SIZE * scalerRatio);
            const centerSize = Math.round(BASE_CENTER_LABEL_SIZE * scalerRatio);
            const armW = Math.round(BASE_ARM_WIDTH * scalerRatio);
            const armH = Math.round(BASE_ARM_HEIGHT * scalerRatio);

            turntableBox.set_size(newHalfWidth, currentHeight);

            // Lemez pozíciója: bal oldalra húzva, függőlegesen középre
            const vinylX = Math.round((newHalfWidth - vinylSize) * 0.35);
            const vinylY = Math.round((currentHeight - vinylSize) / 2);

            discActor.set_size(vinylSize, vinylSize);
            discActor.set_position(vinylX, vinylY);

            vinylTexture.set_icon_size(vinylSize);
            vinylTexture.set_size(vinylSize, vinylSize);

            vinylCoverActor.set_size(centerSize, centerSize);
            vinylCoverActor.set_position(Math.round((vinylSize - centerSize) / 2), Math.round((vinylSize - centerSize) / 2));

            sheenActor.set_icon_size(vinylSize);
            sheenActor.set_size(vinylSize, vinylSize);
            sheenActor.set_position(vinylX, vinylY);

            // Kar pozíciója: jobb felső sarok felé tolva, hogy a lemez jobb szélére érjen
            const armX = vinylX + Math.round(vinylSize * 0.94);
            const armY = Math.max(2, vinylY + Math.round(8 * scalerRatio));

            armActor.set_size(armW, armH);
            armActor.set_position(armX, armY);
        }

        titleLabel.style = `${fontCss}color: ${colors.textColor}; font-size: ${titleSize}px; font-weight: 400; `
            + `margin-bottom: ${Math.max(1, Math.floor(LABEL_MARGIN_BOTTOM_PX * scalerRatio))}px;`;
        artistLabel.style = `${fontCss}color: ${colors.textColor}; opacity: 0.8; font-size: ${artistSize}px; `
            + `margin-bottom: ${Math.max(1, Math.floor(LABEL_MARGIN_BOTTOM_PX * scalerRatio))}px;`;
        albumLabel.style = `${fontCss}color: ${colors.textColor}; opacity: 0.6; font-size: ${albumSize}px; `
            + `margin-bottom: ${Math.max(1, Math.floor(LABEL_MARGIN_BOTTOM_PX * scalerRatio))}px;`;

        updateControlButtonScaling(state, scalerRatio, fontFamily, colors.textColor);

        if (state.controlsColumn) {
            const controlMarginH = Math.max(1, Math.floor(12 * scalerRatio));
            const controlMarginTop = Math.max(1, Math.floor(18 * scalerRatio));
            const controlMarginBottom = Math.max(1, Math.floor(4 * scalerRatio));
            state.controlsColumn.style = `margin: ${controlMarginTop}px ${controlMarginH}px ${controlMarginBottom}px ${controlMarginH}px;`;
        }
    };

    const updateScaling = attachResponsiveScaler(state.container, BASE_CONTAINER_WIDTH, BASE_CONTAINER_HEIGHT, applyLayoutStyles);

    if (config.coverBackground === true) {
        state.refreshBackground = () => {
            if (isActorDestroyed(state.container)) return;
            updateScaling();
        };
    }
}