import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const DEFAULT_REFRESH_INTERVAL_SEC = 900; // 15 perc nyugodt háttérciklus

class StorageEngine {
    constructor() {
        this._subscribers = new Map(); // targetPath => Set of callbacks
        this._timerId = null;
        this._isScanning = false;
        this._cache = new Map(); // targetPath => data

        // GIO Volume Monitor: azonnali esemény, ha meghajtót csatolnak / lecsatolnak!
        this._volumeMonitor = Gio.VolumeMonitor.get();
        this._mountAddedId = this._volumeMonitor.connect('mount-added', () => {
            this.refreshAll();
        });
        this._mountRemovedId = this._volumeMonitor.connect('mount-removed', () => {
            this.refreshAll();
        });
    }

    subscribe(targetPath = '/', callback) {
        const normPath = targetPath || '/';
        if (!this._subscribers.has(normPath)) {
            this._subscribers.set(normPath, new Set());
        }
        const set = this._subscribers.get(normPath);
        set.add(callback);

        const cached = this._cache.get(normPath);
        if (cached) {
            try {
                callback(cached);
            } catch (e) {
                console.error(`[StorageEngine] Initial callback error: ${e}`);
            }
        }

        if (this._getTotalSubscribersCount() === 1) {
            this.refreshAll();
            this._startTimer();
        } else if (!cached) {
            this.refreshPath(normPath);
        }

        return () => {
            set.delete(callback);
            if (set.size === 0) {
                this._subscribers.delete(normPath);
            }
            if (this._getTotalSubscribersCount() === 0) {
                this._stopTimer();
            }
        };
    }

    _getTotalSubscribersCount() {
        let count = 0;
        for (const set of this._subscribers.values()) count += set.size;
        return count;
    }

    _startTimer() {
        this._stopTimer();
        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            DEFAULT_REFRESH_INTERVAL_SEC,
            () => {
                this.refreshAll();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
    }

    refreshAll() {
        for (const path of this._subscribers.keys()) {
            this.refreshPath(path);
        }
    }

    async refreshPath(targetPath = '/') {
        try {
            const data = await this._scanPathAsync(targetPath);
            
            // Ha lecsatolták vagy nem elérhető, offline állapotot küldünk:
            const resultData = data || {
                path: targetPath,
                isUnmounted: true,
                total: 0,
                free: 0,
                used: 0,
                categories: { system: 0, media: 0, archive: 0, image: 0, docs: 0, other: 0 },
            };

            this._cache.set(targetPath, resultData);
            const set = this._subscribers.get(targetPath);
            if (set) {
                for (const cb of set) {
                    try {
                        cb(resultData);
                    } catch (err) {
                        console.error(`[StorageEngine] Callback error: ${err}`);
                    }
                }
            }
        } catch (err) {
            console.error(`[StorageEngine] Scan failed for ${targetPath}: ${err}`);
        }
    }

    async _scanPathAsync(targetPath = '/') {
        const fsInfo = await this._getFsInfoAsync(targetPath);
        if (!fsInfo) return null;

        const breakdown = await this._runFindAwkAsync(targetPath);

        const total = fsInfo.total;
        const free = fsInfo.free;
        const used = Math.max(0, total - free);

        const video = breakdown.video || 0;
        const audio = breakdown.audio || 0;
        const media = video + audio;
        const archive = breakdown.archive || 0;
        const image = breakdown.image || 0;
        const docs = breakdown.docs || 0;
        const otherFolder = breakdown.other || 0;

        const categorizedSum = media + archive + image + docs + otherFolder;
        const system = Math.max(0, used - categorizedSum);

        return {
            path: targetPath,
            total,
            free,
            used,
            categories: {
                system,
                media,
                archive,
                image,
                docs,
                other: otherFolder,
            },
        };
    }

    _getFsInfoAsync(mountPath = '/') {
        return new Promise((resolve) => {
            try {
                const file = Gio.File.new_for_path(mountPath);
                file.query_filesystem_info_async(
                    'filesystem::size,filesystem::free',
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (f, res) => {
                        try {
                            const info = f.query_filesystem_info_finish(res);
                            const total = info.get_attribute_uint64('filesystem::size');
                            const free = info.get_attribute_uint64('filesystem::free');
                            resolve({ total, free });
                        } catch {
                            resolve(null);
                        }
                    }
                );
            } catch {
                resolve(null);
            }
        });
    }

    _runFindAwkAsync(scanPath = '/') {
        return new Promise((resolve) => {
            const file = Gio.File.new_for_path(scanPath);
            if (!file.query_exists(null)) {
                resolve({});
                return;
            }

            const target = (scanPath === '/') ? '$HOME' : `"${scanPath}"`;
            const shellCommand = `timeout 5s find ${target} -maxdepth 6 -name ".*" -prune -o -type f -printf "%b\\t%p\\n" 2>/dev/null | awk -F'\\t' '{
                size = $1 * 512;
                n = split(tolower($2), parts, ".");
                ext = (n > 1) ? parts[n] : "none";
                if (ext ~ /^(mp4|mkv|avi|mov|webm)$/) video += size;
                else if (ext ~ /^(mp3|flac|wav|ogg|aac|m4a|wma)$/) audio += size;
                else if (ext ~ /^(jpg|jpeg|png|gif|webp|svg|bmp)$/) image += size;
                else if (ext ~ /^(pdf|doc|docx|odt|ods|odp|txt|xls|xlsx|csv)$/) docs += size;
                else if (ext ~ /^(zip|tar|gz|7z|rar|iso|deb)$/) archive += size;
                else other += size;
            }
            END {
                printf "{\\"video\\":%d,\\"audio\\":%d,\\"image\\":%d,\\"docs\\":%d,\\"archive\\":%d,\\"other\\":%d}\\n", video, audio, image, docs, archive, other;
            }'`;

            try {
                const proc = Gio.Subprocess.new(
                    ['/bin/bash', '-c', shellCommand],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
                );

                proc.communicate_utf8_async(null, null, (p, res) => {
                    try {
                        const [, stdout] = p.communicate_utf8_finish(res);
                        if (stdout) {
                            const parsed = JSON.parse(stdout.trim());
                            resolve(parsed);
                            return;
                        }
                    } catch (e) {}
                    resolve({});
                });
            } catch (err) {
                resolve({});
            }
        });
    }
}

export const storageEngine = new StorageEngine();