import { resolveWidgetBackgroundColor, resolveWidgetForegroundColor, parseCssColor } from '../../utils/widgetUtils.js';
import { isActorDestroyed } from '../../utils/actorLifecycle.js';
import { extractDominantColor, ensureLocalArtwork } from './artwork.js';

const COVER_TEXT_LUMINANCE_THRESHOLD = 0.55;
const LIGHT_TEXT_ON_DARK_COVER = 'rgba(255, 255, 255, 0.92)';
const DARK_TEXT_ON_LIGHT_COVER = 'rgba(30, 30, 30, 0.92)';

/** Checks whether the dominant cover color is currently tinting the layout, which calls for flat styling. */
export function isCoverTintActive(state) {
    return state.config.coverBackground === true && Boolean(state.albumColor);
}

export function resolveMusicPanelColors(config, state) {
    const baseTextColor = resolveWidgetForegroundColor(config);
    const isCoverTinted = config.coverBackground === true && state.albumColor;
    if (!isCoverTinted)
        return { panelColor: resolveWidgetBackgroundColor(config), textColor: baseTextColor };

    const { r, g, b } = parseCssColor(state.albumColor);
    const luminance = (r * 0.299) + (g * 0.587) + (b * 0.114);
    const textColor = luminance > COVER_TEXT_LUMINANCE_THRESHOLD
        ? DARK_TEXT_ON_LIGHT_COVER
        : LIGHT_TEXT_ON_DARK_COVER;
    return { panelColor: state.albumColor, textColor };
}

export function setAlbumColor(state, color) {
    if (state.albumColor === color) return;
    state.albumColor = color;
    if (state.refreshBackground) state.refreshBackground();
}

// Single source of truth for artwork layer CSS -- all style writes must go through here.
export function resolveArtworkLayerStyle(state) {
    const radius = state.config.appliedBorderRadius !== undefined ? state.config.appliedBorderRadius : 0;
    if (state.config.vinylStyle === true) {
        return 'background-color: transparent;';
    }
    const backgroundColor = resolveWidgetBackgroundColor(state.config);
    const artworkCss = state.artworkCss || 'background-image: none; ';


    // Ha nagy (8x4) layout, csak a bal oldal kerek; ha kis (4x4) widget, mind a 4 sarok kerek!
    const borderRadiusCss = (state.config && state.config.isLargeLayout === true)
        ? `${radius}px 0px 0px ${radius}px`
        : `${radius}px`;

    return `${artworkCss}background-color: ${backgroundColor}; border-radius: ${borderRadiusCss};`;
}

export function applyArtworkToBackground(backgroundLayer, artUrl, config, state) {
    const styleSignature = `${config.appliedBorderRadius !== undefined ? config.appliedBorderRadius : '0px'}|${resolveWidgetBackgroundColor(config)}|${artUrl || ''}`;

    const applyStyle = (localPath) => {
        if (!state.container || isActorDestroyed(state.container)) return;
        if (localPath && localPath === state.lastAppliedArtPath && styleSignature === state.lastAppliedArtStyleSignature) return;

        state.lastAppliedArtPath = localPath;
        state.lastAppliedArtStyleSignature = styleSignature;

        if (!localPath) {
            state.artworkCss = 'background-image: none; ';;
            state.lastAppliedArtPath = null;
            state.lastAppliedArtStyleSignature = styleSignature;
            
            // Ha vinyl mód, legyen transparent, különben a resolveArtworkLayerStyle adja meg:
            if (state.config.vinylStyle === true) {
                backgroundLayer.style = 'background-color: transparent; background-image: none;';
                if (state.vinylCoverActor) {
                    state.vinylCoverActor.style = 'background-image: none; border-radius: 999px; background-color: #1a1a1a;';
                }
            } else {
                backgroundLayer.style = resolveArtworkLayerStyle(state);
            }

            setAlbumColor(state, null);
            return;
        }
        const imageUrl = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
        state.artworkCss = `background-image: url("${imageUrl}"); background-size: cover; `;

        if (state.vinylCoverActor) {
            // Bakelit módban a középső kerek actor kapja a borítót
            state.vinylCoverActor.style = `background-image: url("${imageUrl}"); background-size: cover; border-radius: 999px;`;
        } else {
            backgroundLayer.style = resolveArtworkLayerStyle(state);
        }
        
        extractDominantColor(localPath).then(color => {
            if (isActorDestroyed(state.container) || state.lastAppliedArtPath !== localPath) return;
            setAlbumColor(state, color);
        });
    };

    if (!artUrl) {
        applyStyle(null);
        return;
    }

    ensureLocalArtwork(artUrl, state, applyStyle);
}
