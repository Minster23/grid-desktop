import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';

// Új widget hozzáadásakor használt egyszerűsített felület
export function buildCaptionRows(container, placeholderText) {
    const captionRow = new Adw.EntryRow({
        title: 'Caption',
        text: placeholderText || '',
    });

    const showCaptionRow = new Adw.SwitchRow({
        title: 'Show Caption',
        active: true,
    });

    container.add(captionRow);
    container.add(showCaptionRow);

    return { 
        captionEntry: captionRow, 
        showCaptionSwitch: showCaptionRow 
    };
}

// Meglévő widget szerkesztésekor használt részletes felület (színválasztóval)
export function buildCaptionControls(container, widget, settings, defaultCaption) {
    const captionRow = new Adw.EntryRow({
        title: 'Caption',
        text: widget.caption || defaultCaption || '',
    });

    const globalCaptionKey = widget.type === 'slideshow' ? 'slideshow-show-caption' : 'image-show-caption';
    const isCaptionVisible = widget.showCaption !== undefined 
        ? widget.showCaption 
        : settings.get_boolean(globalCaptionKey);

    const showCaptionRow = new Adw.SwitchRow({
        title: 'Show Caption',
        active: isCaptionVisible,
    });

    const fgColorRow = new Adw.ActionRow({
        title: 'Caption Text Color',
        subtitle: 'Color used for the caption overlay text',
    });

    const fgColorBtn = new Gtk.ColorButton({
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
    });

    const fgRgba = new Gdk.RGBA();
    fgRgba.parse(widget.fgColor || settings.get_string('global-foreground-color') || '#ffffff');
    fgColorBtn.set_rgba(fgRgba);

    const fgColorBox = new Gtk.Box({
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
    });
    fgColorBox.append(fgColorBtn);
    fgColorRow.add_suffix(fgColorBox);

    container.add(captionRow);
    container.add(showCaptionRow);
    container.add(fgColorRow);

    return { 
        captionEntry: captionRow, 
        showCaptionSwitch: showCaptionRow, 
        fgColorBtn 
    };
}