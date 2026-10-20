import St from 'gi://St';
import GLib from 'gi://GLib';
import Rsvg from 'gi://Rsvg';

import {
    resolveWidgetForegroundColor,
    cssColorToRgba,
    CAIRO_OPERATOR_CLEAR,
    CAIRO_OPERATOR_OVER,
} from '../utils/widgetUtils.js';
import {
    createWidgetContainer,
    registerWidgetCleanup,
} from '../shell/widgetUIUtils.js';
import { isActorDestroyed } from '../utils/actorLifecycle.js';
import { LAVA_THEMES } from '../utils/lavaThemes.js';

const BORDER_ALPHA = 0.14;

export function createLavaLampNode(config, width, height, xPosition, yPosition) {
    const textColor = resolveWidgetForegroundColor(config);
    const container = createWidgetContainer(config, width, height, xPosition, yPosition);
    
    container.style += ' background-color: transparent; border: none; box-shadow: none;';

    const themeKey = config.lavaTheme || 'classic';
    const theme = LAVA_THEMES[themeKey] || LAVA_THEMES.classic;

    const drawingArea = new St.DrawingArea({
        x_expand: true,
        y_expand: true,
        width: width,
        height: height,
    });
    container.add_child(drawingArea);

    // Cseppek állapota szinuszos simítással
    const blobs = [
        // 0: Alsó massza
        { x: 100, y: 390, r: 65, baseR: 65, phase: 0 },
        // 1-4: Lebegő cseppek (fix 200x400-as virtuális koordinátákban)
        { x: 95,  y: 330, r: 35, baseR: 35, yMin: 60,  yMax: 350, speed: 0.0032, progress: 0.5, phase: 0.2 },
        { x: 110, y: 240, r: 28, baseR: 28, yMin: 80,  yMax: 360, speed: 0.0042, progress: 2.1, phase: 1.5 },
        { x: 85,  y: 150, r: 38, baseR: 38, yMin: 50,  yMax: 330, speed: 0.0028, progress: 4.2, phase: 3.1 },
        { x: 115, y: 90,  r: 25, baseR: 25, yMin: 90,  yMax: 340, speed: 0.0050, progress: 5.6, phase: 4.2 },
        // 5: Felső hűvös massza
        { x: 100, y: 10,  r: 45, baseR: 45, phase: 2.0 },
    ];

    const rgbHex = (rgb) => {
        const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
        const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
        const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    };

    const lavaColorHex = rgbHex(theme.lava);
    const bgColorHex = rgbHex(theme.bg);
    const glowColorHex = rgbHex(theme.glow);

    drawingArea.connect('repaint', (area) => {
        const ctx = area.get_context();
        const [w, h] = area.get_surface_size();
        if (w <= 0 || h <= 0) {
            ctx.$dispose();
            return;
        }

        ctx.setOperator(CAIRO_OPERATOR_CLEAR);
        ctx.paint();
        ctx.setOperator(CAIRO_OPERATOR_OVER);

        // Dinamikus SVG generálása a Gooey szűrővel
        const circlesSvg = blobs.map(b => 
            `<circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${b.r.toFixed(1)}" fill="${lavaColorHex}" />`
        ).join('\n');

        // A lényeg: a <filter id="goo"> feGaussianBlur + feColorMatrix!
        const svgData = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400" width="${w}" height="${h}">
            <defs>
                <filter id="goo">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur" />
                    <feColorMatrix in="blur" mode="matrix" 
                        values="1 0 0 0 0  
                                0 1 0 0 0  
                                0 0 1 0 0  
                                0 0 0 22 -9" result="goo" />
                    <feComposite in="SourceGraphic" in2="goo" operator="atop" />
                </filter>
                <linearGradient id="bgGlow" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stop-color="${glowColorHex}" stop-opacity="0.45" />
                    <stop offset="70%" stop-color="${glowColorHex}" stop-opacity="0.0" />
                </linearGradient>

                <!-- Lekerekített vágómaszk a widget arányaihoz (rx="24" a 200x400-as viewBox-ban megfelel kb. 12-14px valós rádiusznak) -->
                <clipPath id="roundedClip">
                    <rect width="200" height="400" rx="24" ry="24" />
                </clipPath>
            </defs>

            <!-- A teljes tartalmat maszkoljuk a lekerekített formára -->
            <g clip-path="url(#roundedClip)">
                <!-- Háttér és alsó fényszál meleg derítése -->
                <rect width="200" height="400" fill="${bgColorHex}" />
                <rect width="200" height="400" fill="url(#bgGlow)" />

                <!-- Morfolódó láva réteg -->
                <g filter="url(#goo)">
                    ${circlesSvg}
                </g>
            </g>
        </svg>
        `;

        try {
            const bytes = new GLib.Bytes(new TextEncoder().encode(svgData));
            const handle = Rsvg.Handle.new_from_bytes_available(bytes);
            
            // Rsvg skálázása a Cairo felület méretére
            const viewport = new Rsvg.Rectangle({ x: 0, y: 0, width: w, height: h });
            handle.render_document(ctx, viewport);
        } catch (e) {
            // Fallback régebbi librsvg hívásra
            try {
                const handle = Rsvg.Handle.new_from_data(new TextEncoder().encode(svgData));
                handle.render_cairo(ctx);
            } catch (err) {}
        }

        ctx.$dispose();
    });

    let lastTime = GLib.get_monotonic_time() / 1000.0;
    let isDisposed = false;

    // Időzítő (30 FPS)
    const timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 33, () => {
        if (isDisposed || isActorDestroyed(container) || isActorDestroyed(drawingArea)) {
            return GLib.SOURCE_REMOVE;
        }

        const now = GLib.get_monotonic_time() / 1000.0;
        const dt = Math.min((now - lastTime) / 16.6, 2.0);
        lastTime = now;

        // Alsó massza finom lélegzése
        blobs[0].r = blobs[0].baseR + Math.sin(now * 0.0008) * 3.0;

        for (let i = 1; i <= 4; i++) {
            const b = blobs[i];
            b.progress += b.speed * dt;

            // Szinuszos sima fel-le lebegés
            const t = (1.0 - Math.cos(b.progress)) * 0.5;
            b.y = b.yMin + t * (b.yMax - b.yMin);

            // Tágulás és zsugorodás
            b.r = b.baseR * (0.92 + t * 0.20);

            // Ringatózás oldalra
            b.phase += 0.004 * dt;
            b.x = 100 + Math.sin(b.phase) * 25;
        }

        drawingArea.queue_repaint();
        return GLib.SOURCE_CONTINUE;
    });

    registerWidgetCleanup(container, () => {
        isDisposed = true;
        if (timerId) {
            GLib.source_remove(timerId);
        }
    });

    return container;
}