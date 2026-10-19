import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const DEFAULT_POLL_INTERVAL_MS = 15000; // 15 másodpercenként nézi a helyi cache-t

class MailMonitorEngine {
    constructor() {
        this._subscribers = new Map();
        this._nextId = 1;
        this._timerId = null;
        this._isFetching = false;
        this._lastData = { unreadTotal: 0, accounts: [] };
    }

    subscribe(callback) {
        const id = this._nextId++;
        this._subscribers.set(id, callback);

        // Azonnal átadjuk a legutóbbi adatot, ha már van
        if (this._lastData) {
            callback(this._lastData);
        }

        if (this._subscribers.size === 1) {
            this._start();
        }

        return () => {
            this._subscribers.delete(id);
            if (this._subscribers.size === 0) {
                this._stop();
            }
        };
    }

    _start() {
        if (this._timerId) return;

        this._fetch();
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEFAULT_POLL_INTERVAL_MS, () => {
            this._fetch();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stop() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        this._isFetching = false;
    }

    _notify(data) {
        this._lastData = data;
        for (const callback of this._subscribers.values()) {
            try {
                callback(data);
            } catch (err) {
                console.error('MailEngine subscriber error:', err);
            }
        }
    }

    _fetch() {
        if (this._isFetching) return;
        this._isFetching = true;

        // Python szkript ami végignézi az evolution helyi mail gyorsítótárát
        // Minden Debian/Ubuntu rendszeren alapból fut, nem kell semmit telepíteni
        const pythonScript = `
import os, sqlite3, json, glob, configparser

base_dir = os.path.expanduser('~/.cache/evolution/mail')
sources_dir = os.path.expanduser('~/.config/evolution/sources')

display_names = {}
for sf in glob.glob(os.path.join(sources_dir, '*.source')):
    uid = os.path.splitext(os.path.basename(sf))[0]
    config = configparser.ConfigParser()
    try:
        config.read(sf, encoding='utf-8')
        # [Data Source] szekció alatt van a DisplayName
        if config.has_section('Data Source') and 'DisplayName' in config['Data Source']:
            display_names[uid] = config['Data Source']['DisplayName']
    except Exception:
        pass

results = []
total_unread = 0

for db_path in glob.glob(os.path.join(base_dir, '*/folders.db')):
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT folder_name, unread_count FROM folders WHERE folder_name = 'INBOX' OR folder_name LIKE 'INBOX/%'")
        rows = c.fetchall()
        acc_unread = sum(r[1] for r in rows if r[1] and r[1] > 0)
        
        acc_id = os.path.basename(os.path.dirname(db_path))
        account_name = display_names.get(acc_id, acc_id[:8])

        results.append({
            'id': acc_id,
            'name': account_name,
            'unread': acc_unread
        })
        total_unread += acc_unread
        conn.close()
    except Exception:
        pass

print(json.dumps({'total': total_unread, 'accounts': results}))
`;
        let proc;
        try {
            proc = new Gio.Subprocess({
                argv: ['python3', '-c', pythonScript],
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
            });
            proc.init(null);
        } catch (e) {
            this._isFetching = false;
            return;
        }

        proc.communicate_utf8_async(null, null, (source, res) => {
            this._isFetching = false;
            try {
                const [, stdout] = source.communicate_utf8_finish(res);
                if (stdout && stdout.trim()) {
                    const data = JSON.parse(stdout.trim());
                    this._notify({
                        unreadTotal: data.total || 0,
                        accounts: data.accounts || [],
                    });
                }
            } catch (err) {
                // Hiba esetén nem spameljük a logot
            }
        });
    }
}

export const mailEngine = new MailMonitorEngine();