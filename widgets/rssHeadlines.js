import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import { 
    cssColorToRgba, 
    resolveExplicitFontFamily, 
    resolveWidgetBackgroundColor, 
    resolveWidgetForegroundColor 
} from '../utils/widgetUtils.js';
import { 
    createWidgetContainer, 
    registerWidgetCleanup, 
    attachResponsiveScaler, 
    connectTimerCleanup 
} from '../shell/widgetUIUtils.js';
import { subscribeToFeed } from '../utils/rssEngine.js';
import { isActorDestroyed } from '../utils/actorLifecycle.js';

const REF_WIDTH_PX = 220;
const REF_HEIGHT_PX = 220;
const ARTICLE_TITLE_MAX_CHARS = 140;
const SNIPPET_MAX_CHARS = 400;
const SOURCE_NAME_MAX_CHARS = 30;
const BORDER_ALPHA = 0.14;

const ROTATE_INTERVAL_SECONDS = 15;
const FADE_DURATION_MS = 150;
const MAX_VISIBLE_DOTS = 5;
const MIN_REFRESH_MINUTES = 5;
const DEFAULT_REFRESH_MINUTES = 15;

function clampText(text, maxChars) {
    if (!text) return '';
    return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function sourceNameFromUrl(feedUrl) {
    try {
        const host = new URL(feedUrl).hostname.replace(/^www\./, '');
        return clampText(host, SOURCE_NAME_MAX_CHARS);
    } catch (_urlErr) {
        return 'Feed';
    }
}

function relativeTimeFromIso(dateIso) {
    const publishedMs = dateIso ? Date.parse(dateIso) : NaN;
    if (isNaN(publishedMs)) return '';
    const deltaMinutes = Math.max(0, Math.floor((Date.now() - publishedMs) / 60000));
    if (deltaMinutes < 1) return 'Just now';
    if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
    const hours = Math.floor(deltaMinutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export function createRssHeadlinesNode(config, width, height, xPosition, yPosition) {
    const bgColor = resolveWidgetBackgroundColor(config);
    const textColor = resolveWidgetForegroundColor(config);
    const fontFamily = resolveExplicitFontFamily(config) || 'Sans';
    const fontCss = fontFamily ? `font-family: ${fontFamily}; ` : '';
    const borderRadius = config.appliedBorderRadius || 0;
    const textRgba = (alpha) => cssColorToRgba(textColor, alpha);
    const container = createWidgetContainer(config, width, height, xPosition, yPosition);

    const hasFeed = typeof config.feedUrl === 'string' && config.feedUrl.startsWith('http');
    const refreshIntervalSeconds = Math.max(MIN_REFRESH_MINUTES, config.refreshMinutes || DEFAULT_REFRESH_MINUTES) * 60;

    const state = { timerId: null, releaseFeed: null };
    let articles = [];
    let currentIndex = 0;
    let dotWidgets = [];
    let scale = Math.min(width / REF_WIDTH_PX, height / REF_HEIGHT_PX);

    const mainLayout = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        y_expand: true,
    });
    container.add_child(mainLayout);

    // ── Fejléc ──
    const headerBox = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const sourceLabel = new St.Label({
        text: 'Feed',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    sourceLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    headerBox.add_child(sourceLabel);
    mainLayout.add_child(headerBox);

    // ── Törzs: ScrollView (pontosan mint a TodayHistory-ban) ──
    const scrollView = new St.ScrollView({
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: true,
        x_expand: true,
        y_expand: true,
    });
    mainLayout.add_child(scrollView);

    const bodyBox = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
    });
    scrollView.set_child(bodyBox);

    // Cím: BOLD
    const articleTitle = new St.Label({
        text: '',
        x_expand: true,
    });
    articleTitle.clutter_text.line_wrap = true;
    articleTitle.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    articleTitle.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    bodyBox.add_child(articleTitle);

    // Leírás: Normál szöveg
    const articleSnippet = new St.Label({
        text: '',
        x_expand: true,
    });
    articleSnippet.clutter_text.line_wrap = true;
    articleSnippet.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    articleSnippet.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    bodyBox.add_child(articleSnippet);

    // ── Lábléc ──
    const footerBox = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const timeLabel = new St.Label({
        text: '',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });

    const dotsRow = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        y_align: Clutter.ActorAlign.CENTER,
    });

    footerBox.add_child(timeLabel);
    footerBox.add_child(dotsRow);
    mainLayout.add_child(footerBox);

    function renderDots() {
        dotsRow.destroy_all_children();
        dotWidgets = [];
        const visibleCount = Math.min(articles.length, MAX_VISIBLE_DOTS);
        for (let index = 0; index < visibleCount; index++) {
            const dot = new St.Button({
                reactive: true,
                can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            dot.connect('clicked', () => {
                currentIndex = index;
                applyArticle();
                restartRotationTimer();
            });
            dotsRow.add_child(dot);
            dotWidgets.push(dot);
        }
        updateActiveDot();
    }

    function updateActiveDot() {
        if (!dotWidgets.length) return;
        const activeIndex = currentIndex % MAX_VISIBLE_DOTS;
        dotWidgets.forEach((dot, index) => {
            if (isActorDestroyed(container)) return;
            const isActive = index === activeIndex;
            dot.style = `width: ${isActive ? Math.round(10 * scale) : Math.round(4 * scale)}px;`
                + `height: ${Math.round(4 * scale)}px; border-radius: ${Math.round(2 * scale)}px;`
                + `background-color: ${textColor}; margin: 0 ${Math.round(2 * scale)}px;`
                + `opacity: ${isActive ? 1 : 0.27};`;
        });
    }

    function resetScroll() {
        try {
            const adj = scrollView.vscroll?.adjustment || scrollView.vadjustment;
            if (adj) adj.set_value(0);
        } catch (e) {}
    }

    function applyArticle() {
        if (!hasFeed) {
            sourceLabel.text = 'Feed';
            articleTitle.text = 'No feed configured';
            articleSnippet.text = 'Add a feed URL through the widget settings.';
            timeLabel.text = '';
            renderDots();
            resetScroll();
            return;
        }
        if (articles.length === 0) {
            articleTitle.text = 'Waiting for updates…';
            articleSnippet.text = '';
            timeLabel.text = '';
            renderDots();
            resetScroll();
            return;
        }
        const article = articles[currentIndex % articles.length];
        articleTitle.text = clampText(article.title, ARTICLE_TITLE_MAX_CHARS);
        articleSnippet.text = clampText(article.summary, SNIPPET_MAX_CHARS);
        timeLabel.text = relativeTimeFromIso(article.dateIso);

        const visibleCount = Math.min(articles.length, MAX_VISIBLE_DOTS);
        if (visibleCount !== dotWidgets.length) {
            renderDots();
        } else {
            updateActiveDot();
        }

        resetScroll();
    }

    function rotateArticle(step) {
        if (articles.length === 0 || isActorDestroyed(container)) return;
        currentIndex = ((currentIndex + step) % articles.length + articles.length) % articles.length;
        applyArticle();
        if (!bodyBox.mapped) return;
        bodyBox.opacity = 0;
        bodyBox.ease({
            opacity: 255,
            duration: FADE_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });
    }

    function restartRotationTimer() {
        if (state.timerId) {
            GLib.source_remove(state.timerId);
            state.timerId = null;
        }
        state.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, ROTATE_INTERVAL_SECONDS, () => {
            if (isActorDestroyed(container)) return GLib.SOURCE_REMOVE;
            rotateArticle(1);
            return GLib.SOURCE_CONTINUE;
        });
    }

    connectTimerCleanup(container, state);
    registerWidgetCleanup(container, () => {
        if (state.releaseFeed) state.releaseFeed();
        state.releaseFeed = null;
    });

    if (hasFeed && !state.releaseFeed) {
        sourceLabel.text = sourceNameFromUrl(config.feedUrl);
        state.releaseFeed = subscribeToFeed(config.feedUrl, refreshIntervalSeconds, (items) => {
            if (isActorDestroyed(container)) return;
            articles = Array.isArray(items) ? items : [];
            currentIndex = 0;
            applyArticle();
        });
    }

    restartRotationTimer();

    // ── Reszponzív skálázás beállítása ──
    function applyLayout(currentWidth, currentHeight) {
        if (!currentWidth || !currentHeight) return;
        scale = Math.min(currentWidth / REF_WIDTH_PX, currentHeight / REF_HEIGHT_PX);

        const padding = Math.max(8, Math.round(12 * scale));
        const titleFontSize = Math.max(9, Math.round(10.5 * scale));
        const articleTitleSize = Math.max(12, Math.round(14 * scale));
        const snippetSize = Math.max(11, Math.round(13 * scale));
        const footerFontSize = Math.max(8, Math.round(8.5 * scale));

        container.style = `${fontCss}background-color: ${bgColor}; border-radius: ${borderRadius}px;`
            + `border: 1px solid ${textRgba(BORDER_ALPHA)};`;

        mainLayout.style = `padding: ${padding}px; spacing: ${Math.round(4 * scale)}px;`;

        headerBox.style = `margin-bottom: ${Math.round(4 * scale)}px;`;
        sourceLabel.style = `${fontCss}color: ${textColor}; font-size: ${titleFontSize}px; font-weight: bold; letter-spacing: 0.5px; opacity: 0.9;`;

        bodyBox.style = `spacing: ${Math.round(6 * scale)}px; padding-right: ${Math.round(4 * scale)}px;`;
        
        // Félkövér cím, arányos méret
        articleTitle.style = `${fontCss}color: ${textColor}; font-size: ${articleTitleSize}px; font-weight: bold; line-height: 1.25;`;
        // Normál bekezdés szöveg
        articleSnippet.style = `${fontCss}color: ${textColor}; font-size: ${snippetSize}px; line-height: 1.35; opacity: 0.88;`;

        footerBox.style = `margin-top: ${Math.round(3 * scale)}px;`;
        timeLabel.style = `${fontCss}color: ${textColor}; font-size: ${footerFontSize}px; opacity: 0.45;`;

        updateActiveDot();
        applyArticle();
    }

    applyLayout(width, height);
    attachResponsiveScaler(container, REF_WIDTH_PX, REF_HEIGHT_PX, (_ratio, w, h) => {
        if (isActorDestroyed(container)) return;
        applyLayout(w, h);
    });

    return container;
}