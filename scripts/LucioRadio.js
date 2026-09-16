/*
 * LucioRadio.js
 *
 * Lightweight Now Playing + Lucio-style nickname for SinusBot on TS6.
 * Announces once on playback state changes (play / pause / stop / track change),
 * instead of flooding ClientUpdate every second like Advanced Display Playback.
 *
 * Settings are grouped: General → Nickname → Description → Chat → Advanced.
 *
 * Recommended with:
 *   - Advanced display playback information: OFF
 *   - Animated Nickname: OFF
 */

registerPlugin({
    name: 'Lucio Radio',
    version: '1.10.1',
    engine: '>= 0.9.16',
    description: 'TS6-friendly Lucio radio: nick/desc/chat; persists !repeat/!shuffle across restarts.',
    author: 'local',
    vars: [
        // ── General ──────────────────────────────────────────────
        {
            name: 'enabled',
            title: '[General] Enable script',
            type: 'checkbox',
            default: true
        }, {
            name: 'debug',
            title: '[General] Debug logging',
            type: 'checkbox',
            default: false
        },

        // ── Nickname ─────────────────────────────────────────────
        {
            name: 'baseNick',
            title: '[Nickname] Base nickname when stopped',
            type: 'string',
            placeholder: '🎧 LÚCIO RADIO'
        }, {
            name: 'showSongInNick',
            title: '[Nickname] Show song title while playing/paused',
            type: 'checkbox',
            default: true
        }, {
            name: 'songNickTemplate',
            indent: 1,
            title: 'Playing nickname (%t title, %a artist, %v volume)',
            type: 'string',
            placeholder: '🎧 ♪ %t',
            conditions: [{ field: 'showSongInNick', value: true }]
        }, {
            name: 'pausedNickTemplate',
            indent: 1,
            title: 'Paused nickname (%t / %a / %v)',
            type: 'string',
            placeholder: '⏸ ♪ %t',
            conditions: [{ field: 'showSongInNick', value: true }]
        }, {
            name: 'showVolumeInNick',
            title: '[Nickname] Show volume in nickname',
            type: 'checkbox',
            default: false
        }, {
            name: 'nickVolumeFormat',
            indent: 1,
            title: 'Volume format (%v/%V = number). Appended if song template has no %v. Examples:  ·%v%  |  ~%v  |  (%v%)',
            type: 'string',
            placeholder: ' ·%v%',
            conditions: [{ field: 'showVolumeInNick', value: true }]
        }, {
            name: 'showRepeatInNick',
            title: '[Nickname] Show repeat when ON',
            type: 'checkbox',
            default: true
        }, {
            name: 'nickRepeatFormat',
            indent: 1,
            title: 'Repeat text (appended only when repeat is ON)',
            type: 'string',
            placeholder: '🔁',
            conditions: [{ field: 'showRepeatInNick', value: true }]
        }, {
            name: 'showShuffleInNick',
            title: '[Nickname] Show shuffle when ON',
            type: 'checkbox',
            default: true
        }, {
            name: 'nickShuffleFormat',
            indent: 1,
            title: 'Shuffle text (appended only when shuffle is ON)',
            type: 'string',
            placeholder: '🔀',
            conditions: [{ field: 'showShuffleInNick', value: true }]
        }, {
            name: 'nickFrames',
            title: '[Nickname] Idle animation frames when stopped (comma-separated, empty = off)',
            type: 'string',
            placeholder: '🎧 LÚCIO RADIO,🎶 LÚCIO RADIO,🎵 LÚCIO RADIO'
        }, {
            name: 'animIntervalMs',
            indent: 1,
            title: 'Idle animation interval (ms, ≥ 5000 recommended)',
            type: 'number',
            placeholder: '8000'
        },

        // ── Description ──────────────────────────────────────────
        {
            name: 'setDescription',
            title: '[Description] Update bot description',
            type: 'checkbox',
            default: true
        }, {
            name: 'descPlayingTemplate',
            indent: 1,
            title: 'Playing description (%t / %a / %v). Keep short.',
            type: 'string',
            placeholder: '▶ %t',
            conditions: [{ field: 'setDescription', value: true }]
        }, {
            name: 'descPausedTemplate',
            indent: 1,
            title: 'Paused description (%t / %a / %v)',
            type: 'string',
            placeholder: '⏸ %t',
            conditions: [{ field: 'setDescription', value: true }]
        }, {
            name: 'idleDescription',
            indent: 1,
            title: 'Stopped description',
            type: 'string',
            placeholder: '🎧 LÚCIO RADIO',
            conditions: [{ field: 'setDescription', value: true }]
        }, {
            name: 'showVolumeInDesc',
            indent: 1,
            title: 'Show volume in description (default OFF — UI is small)',
            type: 'checkbox',
            default: false,
            conditions: [{ field: 'setDescription', value: true }]
        }, {
            name: 'descVolumeFormat',
            indent: 2,
            title: 'Volume format (%v/%V). Appended if description template has no %v.',
            type: 'string',
            placeholder: ' ·%v%',
            conditions: [
                { field: 'setDescription', value: true },
                { field: 'showVolumeInDesc', value: true }
            ]
        }, {
            name: 'showRepeatInDesc',
            indent: 1,
            title: 'Show repeat when ON',
            type: 'checkbox',
            default: false,
            conditions: [{ field: 'setDescription', value: true }]
        }, {
            name: 'descRepeatFormat',
            indent: 2,
            title: 'Repeat text (appended only when repeat is ON)',
            type: 'string',
            placeholder: '🔁',
            conditions: [
                { field: 'setDescription', value: true },
                { field: 'showRepeatInDesc', value: true }
            ]
        }, {
            name: 'showShuffleInDesc',
            indent: 1,
            title: 'Show shuffle when ON',
            type: 'checkbox',
            default: false,
            conditions: [{ field: 'setDescription', value: true }]
        }, {
            name: 'descShuffleFormat',
            indent: 2,
            title: 'Shuffle text (appended only when shuffle is ON)',
            type: 'string',
            placeholder: '🔀',
            conditions: [
                { field: 'setDescription', value: true },
                { field: 'showShuffleInDesc', value: true }
            ]
        },

        // ── Chat ─────────────────────────────────────────────────
        {
            name: 'chatAnnounce',
            title: '[Chat] Announce in channel chat',
            type: 'checkbox',
            default: true
        }, {
            name: 'announcePause',
            indent: 1,
            title: 'Announce pause',
            type: 'checkbox',
            default: true,
            conditions: [{ field: 'chatAnnounce', value: true }]
        }, {
            name: 'announceStop',
            indent: 1,
            title: 'Announce stop (suppressed during !next)',
            type: 'checkbox',
            default: true,
            conditions: [{ field: 'chatAnnounce', value: true }]
        }, {
            name: 'chatPlayingTemplate',
            indent: 1,
            title: 'Playing chat (%t / %a)',
            type: 'string',
            placeholder: '🎵 Now Playing: %a - %t',
            conditions: [{ field: 'chatAnnounce', value: true }]
        }, {
            name: 'chatPausedTemplate',
            indent: 1,
            title: 'Paused chat (%t / %a)',
            type: 'string',
            placeholder: '⏸ Paused: %a - %t',
            conditions: [
                { field: 'chatAnnounce', value: true },
                { field: 'announcePause', value: true }
            ]
        }, {
            name: 'chatStoppedTemplate',
            indent: 1,
            title: 'Stopped chat',
            type: 'string',
            placeholder: '⏹ Playback stopped',
            conditions: [
                { field: 'chatAnnounce', value: true },
                { field: 'announceStop', value: true }
            ]
        }, {
            name: 'hideUrlInChat',
            indent: 1,
            title: 'Hide URL-like titles (prefer artist/album)',
            type: 'checkbox',
            default: true,
            conditions: [{ field: 'chatAnnounce', value: true }]
        }, {
            name: 'trackSwitchGraceMs',
            indent: 1,
            title: '!next grace window (ms) — suppress stop/pause chat if next track starts',
            type: 'number',
            placeholder: '2500',
            conditions: [{ field: 'chatAnnounce', value: true }]
        }, {
            name: 'playChatDebounceMs',
            indent: 1,
            title: 'Max wait for metadata before Now Playing chat (ms)',
            type: 'number',
            placeholder: '3000',
            conditions: [{ field: 'chatAnnounce', value: true }]
        },

        // ── Advanced ─────────────────────────────────────────────
        {
            name: 'statePollMs',
            title: '[Advanced] State/volume poll interval (ms, 2000–3000 recommended)',
            type: 'number',
            placeholder: '2000'
        }, {
            name: 'connectSettleMs',
            title: '[Advanced] Wait after connect before ClientUpdate (ms, 5000–8000 recommended)',
            type: 'number',
            placeholder: '5000'
        }, {
            name: 'clientUpdateGapMs',
            title: '[Advanced] Min gap between nick/desc ClientUpdates (ms, 1500–2500 recommended)',
            type: 'number',
            placeholder: '2000'
        }, {
            name: 'volumeSettleMs',
            title: '[Advanced] Wait after volume change before nick/desc update (ms). Re-arms while AloneMode fade is still moving.',
            type: 'number',
            placeholder: '1200'
        }
    ]
}, function (_, config) {
    var engine = require('engine');
    var backend = require('backend');
    var event = require('event');
    var media = require('media');
    var audio = require('audio');
    var store = null;
    try {
        store = require('store');
    } catch (eStore) {
        store = null;
    }

    var NICK_MAX = 30;
    var DESC_MAX = 200;
    var SCRIPT_VERSION = '1.10.1';

    var animTimer = null;
    var pollTimer = null;
    var settleTimer = null;
    var volTimer = null;
    var flushTimer = null;
    var switchTimer = null;
    var playChatTimer = null;
    var animIndex = 0;

    var connected = false;
    var clientReady = false;

    var lastState = '';
    var lastTrackKey = '';
    var lastVolume = null;
    var lastRepeat = null;
    var lastShuffle = null;
    // Shadow of real player mode when media.isRepeat()/isShuffle() lags behind Web/commands
    var repeatLocal = null;
    var shuffleLocal = null;
    var repeatCmdPending = false;
    var shuffleCmdPending = false;
    var repeatCmdTimer = null;
    var shuffleCmdTimer = null;
    var skipDupLogCount = 0;
    var lastParts = { title: '', artist: '', key: '' };
    var lastChatKey = '';
    var switchEpoch = 0;

    var appliedNick = '';
    var appliedDesc = '';
    var pendingNick = null;
    var pendingDesc = null;
    var lastClientUpdateAt = 0;
    var pendingVolume = null;

    function cfg(key, fallback) {
        if (typeof config[key] === 'undefined' || config[key] === null || config[key] === '') {
            return fallback;
        }
        return config[key];
    }

    /** Checkbox helper: missing key → defaultValue (SinusBot often omits new defaults from saved config). */
    function optFlag(key, defaultValue) {
        var v = config[key];
        if (typeof v === 'undefined' || v === null) {
            return !!defaultValue;
        }
        if (v === true || v === 1 || v === '1' || v === 'true') {
            return true;
        }
        if (v === false || v === 0 || v === '0' || v === 'false') {
            return false;
        }
        return !!v;
    }

    function numCfg(key, fallback, min, max) {
        var n = parseInt(cfg(key, fallback), 10);
        if (isNaN(n)) {
            n = fallback;
        }
        if (typeof min === 'number' && n < min) {
            n = min;
        }
        if (typeof max === 'number' && n > max) {
            n = max;
        }
        return n;
    }

    function log(msg) {
        if (config.debug) {
            engine.log('[LucioRadio] ' + msg);
        }
    }

    function truncate(str, max) {
        str = String(str || '');
        if (str.length <= max) {
            return str;
        }
        if (max <= 1) {
            return str.slice(0, max);
        }
        return str.slice(0, max - 1) + '…';
    }

    function looksLikeUrl(s) {
        s = String(s || '');
        return /^https?:\/\//i.test(s) || /^www\./i.test(s) || s.indexOf('ytdl://') === 0;
    }

    function safe(val, fallback) {
        if (val === undefined || val === null || val === '' || val === 'undefined') {
            return fallback;
        }
        return String(val);
    }

    function isBotConnected() {
        try {
            if (typeof backend.isConnected === 'function') {
                return !!backend.isConnected();
            }
        } catch (e) {}
        try {
            return !!(backend.getBotClient && backend.getBotClient());
        } catch (e2) {
            return false;
        }
    }

    function parseYtdlQuery(raw) {
        var out = { album: '', title: '', artist: '' };
        if (!raw) {
            return out;
        }
        var q = String(raw);
        var qi = q.indexOf('?');
        if (qi >= 0) {
            q = q.slice(qi + 1);
        }
        var parts = q.split('&');
        for (var i = 0; i < parts.length; i++) {
            var eq = parts[i].indexOf('=');
            if (eq < 0) {
                continue;
            }
            var k = parts[i].slice(0, eq);
            var v = parts[i].slice(eq + 1);
            try {
                k = decodeURIComponent(k.replace(/\+/g, ' '));
                v = decodeURIComponent(v.replace(/\+/g, ' '));
            } catch (e) {}
            if (k === 'album' && v) {
                out.album = v;
            }
            if (k === 'title' && v) {
                out.title = v;
            }
            if ((k === 'artist' || k === 'uploader' || k === 'channel') && v) {
                out.artist = v;
            }
        }
        return out;
    }

    function trackParts(track) {
        if (!track) {
            return { title: 'Unknown', artist: 'Unknown', key: '' };
        }

        var type = '';
        try {
            type = track.type() || '';
        } catch (e) {
            type = '';
        }

        var title = safe(track.title && track.title(), '');
        var artist = safe(track.artist && track.artist(), '');
        var album = safe(track.album && track.album(), '');
        var tempTitle = safe(track.tempTitle && track.tempTitle(), '');
        var tempArtist = safe(track.tempArtist && track.tempArtist(), '');

        var id = '';
        try {
            id = (track.id && track.id()) || '';
        } catch (e2) {
            id = '';
        }
        var url = '';
        try {
            url = (track.url && track.url()) || '';
        } catch (e3) {
            url = '';
        }
        var filename = '';
        try {
            filename = (track.filename && track.filename()) || '';
        } catch (e4) {
            filename = '';
        }

        // SinusBot often embeds album/title in ytdl:// query before artist() is ready
        var ymeta = parseYtdlQuery(url || filename || '');
        if ((!album || album === 'Unknown') && ymeta.album) {
            album = ymeta.album;
        }
        if ((!title || looksLikeUrl(title) || title === 'Unknown') && ymeta.title) {
            title = ymeta.title;
        }
        if ((!artist || artist === 'Unknown') && ymeta.artist) {
            artist = ymeta.artist;
        }
        if ((!artist || artist === 'Unknown') && ymeta.album) {
            artist = ymeta.album;
        }

        if (type === 'url') {
            if ((!title || looksLikeUrl(title)) && tempTitle) {
                title = tempTitle;
            }
            if ((!artist || artist === 'Unknown') && tempArtist) {
                artist = tempArtist;
            }
            if ((!title || looksLikeUrl(title)) && album) {
                title = album;
            }
        }

        if ((type === 'ytdl' || type === 'temp' || !type) && (!artist || artist === 'Unknown') && album && album !== 'Unknown') {
            artist = album;
        }

        if (config.hideUrlInChat !== false && looksLikeUrl(title)) {
            if (tempTitle && !looksLikeUrl(tempTitle)) {
                title = tempTitle;
            } else if (ymeta.title) {
                title = ymeta.title;
            } else if (album && !looksLikeUrl(album)) {
                title = album;
            } else {
                title = 'YouTube / Stream';
            }
        }

        title = safe(title, 'Unknown');
        artist = safe(artist, 'Unknown');

        return {
            title: title,
            artist: artist,
            key: id || url || filename || (artist + '|' + title)
        };
    }

    function metaReady(parts) {
        return !!(parts &&
            parts.title && parts.title !== 'Unknown' && !looksLikeUrl(parts.title) &&
            parts.artist && parts.artist !== 'Unknown');
    }

    function getVolume() {
        try {
            var v = audio.getVolume();
            if (typeof v !== 'number' || isNaN(v)) {
                return 0;
            }
            return Math.round(v);
        } catch (e) {
            return 0;
        }
    }

    function coerceOn(v) {
        return v === true || v === 1 || v === '1' || v === 'true';
    }

    function apiRepeat() {
        try {
            if (typeof media.isRepeat === 'function') {
                return coerceOn(media.isRepeat());
            }
        } catch (e) {
            log('isRepeat failed: ' + e);
        }
        return false;
    }

    function applyRepeat(enabled) {
        var v = !!enabled;
        try {
            if (typeof media.setRepeat === 'function') {
                media.setRepeat(v);
                return true;
            }
        } catch (e) {
            engine.log('[LucioRadio] media.setRepeat failed: ' + e);
        }
        try {
            if (typeof audio.setRepeat === 'function') {
                audio.setRepeat(v);
                return true;
            }
        } catch (e2) {
            engine.log('[LucioRadio] audio.setRepeat failed: ' + e2);
        }
        return false;
    }

    function applyShuffle(enabled) {
        var v = !!enabled;
        try {
            if (typeof media.setShuffle === 'function') {
                media.setShuffle(v);
                return true;
            }
        } catch (e) {
            engine.log('[LucioRadio] media.setShuffle failed: ' + e);
        }
        try {
            if (typeof audio.setShuffle === 'function') {
                audio.setShuffle(v);
                return true;
            }
        } catch (e2) {
            engine.log('[LucioRadio] audio.setShuffle failed: ' + e2);
        }
        return false;
    }

    function announceMode(kind, enabled) {
        var msg = kind === 'shuffle'
            ? (enabled ? 'Shuffle is now enabled' : 'Shuffle is now disabled')
            : (enabled ? 'Repeat is now enabled' : 'Repeat is now disabled');
        try {
            backend.chat(msg);
            engine.log('[LucioRadio] announced: ' + msg);
        } catch (e) {
            engine.log('[LucioRadio] backend.chat failed: ' + e);
        }
    }

    function apiShuffle() {
        try {
            if (typeof media.isShuffle === 'function') {
                return coerceOn(media.isShuffle());
            }
        } catch (e) {
            log('isShuffle failed: ' + e);
        }
        return false;
    }

    function saveModeLocals() {
        if (!store) {
            return;
        }
        try {
            store.set('lucio.repeatLocal', repeatLocal);
            store.set('lucio.shuffleLocal', shuffleLocal);
        } catch (e) {
            log('store set failed: ' + e);
        }
    }

    function coerceStoredBool(v) {
        if (v === true || v === 1 || v === '1' || v === 'true') {
            return true;
        }
        if (v === false || v === 0 || v === '0' || v === 'false') {
            return false;
        }
        return null;
    }

    function loadModeLocals() {
        repeatLocal = null;
        shuffleLocal = null;
        if (!store) {
            engine.log('[LucioRadio] no store — cannot restore repeat/shuffle');
            return;
        }
        try {
            repeatLocal = coerceStoredBool(store.get('lucio.repeatLocal'));
            shuffleLocal = coerceStoredBool(store.get('lucio.shuffleLocal'));
            engine.log('[LucioRadio] restored from store repeat=' + repeatLocal + ' shuffle=' + shuffleLocal);
        } catch (e) {
            engine.log('[LucioRadio] store get failed: ' + e);
            repeatLocal = null;
            shuffleLocal = null;
        }
    }

    /** After restart, push stored mode into the player engine (API often resets to off). */
    function applyStoredModesToPlayer(reason) {
        var did = false;
        if (repeatLocal === true || repeatLocal === false) {
            if (applyRepeat(!!repeatLocal)) {
                did = true;
            }
        }
        if (shuffleLocal === true || shuffleLocal === false) {
            if (applyShuffle(!!shuffleLocal)) {
                did = true;
            }
        }
        engine.log('[LucioRadio] applyStoredModes (' + reason + ') repeat=' + repeatLocal +
            ' shuffle=' + shuffleLocal + ' applied=' + did);
        refreshModeVisuals('restore:' + reason);
    }

    function getRepeat() {
        if (repeatLocal !== null) {
            return !!repeatLocal;
        }
        return apiRepeat();
    }

    function getShuffle() {
        if (shuffleLocal !== null) {
            return !!shuffleLocal;
        }
        return apiShuffle();
    }

    function wantShowRepeatNick() {
        if (typeof config.showRepeatInNick === 'undefined' || config.showRepeatInNick === null) {
            return true;
        }
        return optFlag('showRepeatInNick', true);
    }

    function wantShowShuffleNick() {
        if (typeof config.showShuffleInNick === 'undefined' || config.showShuffleInNick === null) {
            return true;
        }
        return optFlag('showShuffleInNick', true);
    }

    function setRepeatLocal(enabled, reason) {
        repeatLocal = !!enabled;
        applyRepeat(repeatLocal);
        saveModeLocals();
        engine.log('[LucioRadio] setRepeatLocal=' + enabled + ' api=' + apiRepeat() + ' stored=' + repeatLocal + ' (' + reason + ')');
        refreshModeVisuals(reason);
    }

    function setShuffleLocal(enabled, reason) {
        shuffleLocal = !!enabled;
        applyShuffle(shuffleLocal);
        saveModeLocals();
        engine.log('[LucioRadio] setShuffleLocal=' + enabled + ' api=' + apiShuffle() + ' stored=' + shuffleLocal + ' (' + reason + ')');
        refreshModeVisuals(reason);
    }

    function parseRepeatStatus(text) {
        var t = String(text || '');
        if (/repeat\s+is\s+now\s+enabled/i.test(t)) {
            return true;
        }
        if (/repeat\s+is\s+now\s+disabled/i.test(t)) {
            return false;
        }
        return null;
    }

    function parseShuffleStatus(text) {
        var t = String(text || '');
        if (/shuffle\s+is\s+now\s+enabled/i.test(t)) {
            return true;
        }
        if (/shuffle\s+is\s+now\s+disabled/i.test(t)) {
            return false;
        }
        return null;
    }

    function refreshModeVisuals(reason) {
        lastRepeat = getRepeat();
        lastShuffle = getShuffle();
        engine.log('[LucioRadio] mode refresh (' + reason + ') repeat=' + lastRepeat +
            ' shuffle=' + lastShuffle + ' apiRepeat=' + apiRepeat() +
            ' showNickRepeat=' + wantShowRepeatNick());
        if (config.setDescription !== false && descModeEnabled()) {
            refreshDescription(lastState || 'stopped', lastParts);
        }
        if (optFlag('showVolumeInNick', false) || nickModeEnabled()) {
            refreshNickVisual();
        } else if (wantShowRepeatNick() || wantShowShuffleNick()) {
            refreshNickVisual();
        }
        scheduleFlush();
    }

    function handleRepeatCommand() {
        repeatCmdPending = true;
        if (repeatCmdTimer) {
            clearTimeout(repeatCmdTimer);
        }
        // Wait briefly for core "Repeat is now …" chat. If silent (common on TS6 /
        // antiflood / no chat event for bot self), toggle + announce ourselves.
        repeatCmdTimer = setTimeout(function () {
            repeatCmdTimer = null;
            if (!repeatCmdPending) {
                return;
            }
            repeatCmdPending = false;
            var api = apiRepeat();
            if (api) {
                setRepeatLocal(true, '!repeat-api');
                announceMode('repeat', true);
                return;
            }
            var next = !getRepeat();
            applyRepeat(next);
            setRepeatLocal(next, '!repeat-fallback');
            announceMode('repeat', next);
            engine.log('[LucioRadio] !repeat fallback → ' + next + ' (no core status text)');
        }, 1200);
    }

    function handleShuffleCommand() {
        shuffleCmdPending = true;
        if (shuffleCmdTimer) {
            clearTimeout(shuffleCmdTimer);
        }
        shuffleCmdTimer = setTimeout(function () {
            shuffleCmdTimer = null;
            if (!shuffleCmdPending) {
                return;
            }
            shuffleCmdPending = false;
            var api = apiShuffle();
            if (api) {
                setShuffleLocal(true, '!shuffle-api');
                announceMode('shuffle', true);
                return;
            }
            var next = !getShuffle();
            applyShuffle(next);
            setShuffleLocal(next, '!shuffle-fallback');
            announceMode('shuffle', next);
            engine.log('[LucioRadio] !shuffle fallback → ' + next + ' (no core status text)');
        }, 1200);
    }

    function ingestStatusText(text) {
        var rep = parseRepeatStatus(text);
        if (rep !== null) {
            repeatCmdPending = false;
            if (repeatCmdTimer) {
                clearTimeout(repeatCmdTimer);
                repeatCmdTimer = null;
            }
            setRepeatLocal(rep, 'status-text');
        }
        var shuf = parseShuffleStatus(text);
        if (shuf !== null) {
            shuffleCmdPending = false;
            if (shuffleCmdTimer) {
                clearTimeout(shuffleCmdTimer);
                shuffleCmdTimer = null;
            }
            setShuffleLocal(shuf, 'status-text');
        }
    }

    function hasVolPlaceholder(s) {
        return /%v/i.test(String(s || ''));
    }

    function stripVolPlaceholder(s) {
        return String(s || '')
            .replace(/%v/gi, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+$/g, '');
    }

    /** Appended suffix pieces (volume-style): only when switch ON and mode ON. */
    function appendFormatPiece(base, enabled, isOn, format, fallback) {
        if (!enabled || !isOn) {
            return base;
        }
        var piece = String(cfg(format, fallback) || fallback || '');
        if (!piece) {
            return base;
        }
        // Formats may already include a leading space (like volume " ·%v%")
        if (/^\s/.test(piece)) {
            return base + piece;
        }
        return base + ' ' + piece;
    }

    function render(template, parts) {
        var vol = getVolume();
        return String(template || '')
            .replace(/%t/g, parts.title || '')
            .replace(/%a/g, parts.artist || '')
            .replace(/%v/gi, String(vol));
    }

    /**
     * Build nickname with optional custom volume format.
     * nickVolumeFormat examples: " ·%v%" / "~%v" / "(%v%)" / " |%v"
     */
    function renderNick(template, parts) {
        var tpl = String(template || '');
        var wantVol = config.showVolumeInNick === true;
        var volFmt = cfg('nickVolumeFormat', ' ·%v%');
        var appendedVol = false;

        if (wantVol) {
            if (!hasVolPlaceholder(tpl)) {
                tpl = tpl + volFmt;
                appendedVol = true;
            }
        } else {
            tpl = stripVolPlaceholder(tpl);
        }

        var nick = render(tpl, parts);

        // Same pattern as volume: separate optional suffixes
        var beforeMode = nick;
        nick = appendFormatPiece(nick, wantShowRepeatNick(), getRepeat(), 'nickRepeatFormat', '🔁');
        nick = appendFormatPiece(nick, wantShowShuffleNick(), getShuffle(), 'nickShuffleFormat', '🔀');
        var modeTail = nick.slice(beforeMode.length);

        if (nick.length <= NICK_MAX) {
            return nick;
        }

        if (modeTail) {
            var budget = NICK_MAX - modeTail.length;
            if (budget >= 4) {
                return truncate(beforeMode.replace(/\s+$/, ''), budget) + modeTail;
            }
        }

        if (wantVol && appendedVol) {
            var suffix = render(volFmt, parts);
            if (suffix && beforeMode.lastIndexOf(suffix) === beforeMode.length - suffix.length) {
                var head = truncate(beforeMode.slice(0, beforeMode.length - suffix.length).replace(/\s+$/, ''), NICK_MAX - suffix.length - modeTail.length);
                return truncate(head + suffix + modeTail, NICK_MAX);
            }
        }
        return truncate(nick, NICK_MAX);
    }

    function queueSongNick(template, parts) {
        if (config.showSongInNick === false) {
            var list = frames();
            var idle = list.length ? list[0] : cfg('baseNick', '🎧 LÚCIO RADIO');
            if (config.showVolumeInNick === true || nickModeEnabled()) {
                queueNick(renderNick(idle, parts));
            } else {
                queueNick(idle);
            }
            return;
        }
        queueNick(renderNick(template, parts));
    }

    function nickModeEnabled() {
        return wantShowRepeatNick() || wantShowShuffleNick();
    }

    function descModeEnabled() {
        return optFlag('showRepeatInDesc', false) || optFlag('showShuffleInDesc', false);
    }

    function refreshNickVisual() {
        if (!optFlag('showVolumeInNick', false) && !nickModeEnabled()) {
            return;
        }
        var parts = lastParts || { title: '', artist: '', key: '' };
        if (lastState === 'playing') {
            queueSongNick(cfg('songNickTemplate', '🎧 ♪ %t'), parts);
        } else if (lastState === 'paused') {
            queueSongNick(cfg('pausedNickTemplate', '⏸ ♪ %t'), parts);
        } else {
            queueNick(renderNick(cfg('baseNick', '🎧 LÚCIO RADIO'), parts));
        }
    }

    function refreshNickForVolume() {
        refreshNickVisual();
    }

    function scheduleFlush() {
        if (flushTimer) {
            return;
        }
        var gap = numCfg('clientUpdateGapMs', 2000, 500, 10000);
        var wait = Math.max(0, (lastClientUpdateAt + gap) - Date.now());
        flushTimer = setTimeout(function () {
            flushTimer = null;
            flushClientUpdates();
        }, wait);
    }

    function flushClientUpdates() {
        if (!config.enabled || !clientReady || !isBotConnected()) {
            log('flush skipped (ready=' + clientReady + ')');
            return;
        }

        var did = false;
        var gap = numCfg('clientUpdateGapMs', 2000, 500, 10000);
        var now = Date.now();
        if (now - lastClientUpdateAt < gap) {
            scheduleFlush();
            return;
        }

        // Prefer nick first (more visible), then description — one at a time per gap
        if (pendingNick !== null && pendingNick !== appliedNick) {
            try {
                engine.setNick(pendingNick);
                appliedNick = pendingNick;
                lastClientUpdateAt = Date.now();
                did = true;
                log('nick -> ' + pendingNick);
            } catch (e) {
                engine.log('[LucioRadio] setNick failed: ' + e);
            }
            pendingNick = null;
            if (pendingDesc !== null && pendingDesc !== appliedDesc) {
                scheduleFlush();
            }
            return;
        }
        pendingNick = null;

        if (pendingDesc !== null && pendingDesc !== appliedDesc) {
            try {
                var bot = backend.getBotClient();
                if (bot) {
                    bot.setDescription(pendingDesc);
                    appliedDesc = pendingDesc;
                    lastClientUpdateAt = Date.now();
                    did = true;
                    log('desc -> ' + pendingDesc);
                }
            } catch (e2) {
                engine.log('[LucioRadio] setDescription failed: ' + e2);
            }
        }
        pendingDesc = null;

        if (!did) {
            log('flush noop');
        }
    }

    function queueNick(nick) {
        nick = truncate(nick, NICK_MAX);
        if (!nick || nick.length < 3) {
            return;
        }
        if (nick === appliedNick && pendingNick === null) {
            return;
        }
        pendingNick = nick;
        if (!clientReady) {
            log('nick queued until ready: ' + nick);
            return;
        }
        scheduleFlush();
    }

    function queueDesc(desc) {
        if (config.setDescription === false) {
            return;
        }
        desc = truncate(desc, DESC_MAX);
        if (desc === appliedDesc && pendingDesc === null) {
            return;
        }
        pendingDesc = desc;
        if (!clientReady) {
            log('desc queued until ready');
            return;
        }
        scheduleFlush();
    }

    /**
     * Compact description. Volume only when showVolumeInDesc === true (default off).
     * Uses descVolumeFormat when template has no %v.
     */
    function renderDesc(template, parts) {
        var tpl = String(template || '');
        var wantVol = config.showVolumeInDesc === true;
        var volFmt = cfg('descVolumeFormat', ' ·%v%');

        if (wantVol) {
            if (!hasVolPlaceholder(tpl)) {
                tpl = tpl + volFmt;
            }
        } else {
            tpl = stripVolPlaceholder(tpl);
        }

        var desc = render(tpl, parts);
        desc = appendFormatPiece(desc, optFlag('showRepeatInDesc', false), getRepeat(), 'descRepeatFormat', '🔁');
        desc = appendFormatPiece(desc, optFlag('showShuffleInDesc', false), getShuffle(), 'descShuffleFormat', '🔀');
        return truncate(desc, DESC_MAX);
    }

    function refreshDescription(state, parts) {
        if (config.setDescription === false) {
            return;
        }
        state = state || lastState || 'stopped';
        parts = parts || lastParts || { title: '', artist: '', key: '' };

        if (state === 'playing') {
            queueDesc(renderDesc(cfg('descPlayingTemplate', '▶ %t'), parts));
        } else if (state === 'paused') {
            queueDesc(renderDesc(cfg('descPausedTemplate', '⏸ %t'), parts));
        } else {
            queueDesc(renderDesc(cfg('idleDescription', '🎧 LÚCIO RADIO'), parts));
        }
    }

    function chat(msg) {
        msg = String(msg || '');
        if (!msg) {
            return;
        }
        if (!clientReady || !isBotConnected()) {
            log('chat skipped (not ready)');
            return;
        }
        try {
            var channel = backend.getCurrentChannel();
            if (channel) {
                channel.chat(msg);
                log('chat -> ' + msg);
            }
        } catch (e) {
            engine.log('[LucioRadio] channel.chat failed: ' + e);
        }
    }

    function frames() {
        var raw = cfg('nickFrames', '');
        if (!raw) {
            return [];
        }
        return raw.split(',').map(function (s) {
            return s.trim();
        }).filter(function (s) {
            return s.length > 0;
        });
    }

    function stopAnim() {
        if (animTimer) {
            clearInterval(animTimer);
            animTimer = null;
        }
    }

    function startIdleAnim() {
        stopAnim();
        if (!config.enabled || !clientReady) {
            return;
        }
        var list = frames();
        if (list.length < 2) {
            return;
        }
        var interval = numCfg('animIntervalMs', 8000, 3000, 60000);
        animIndex = 0;
        animTimer = setInterval(function () {
            if (!config.enabled || !clientReady) {
                return;
            }
            if (audio.isPlaying() || lastState === 'playing' || lastState === 'paused') {
                return;
            }
            var listNow = frames();
            if (listNow.length < 2) {
                return;
            }
            if (animIndex >= listNow.length) {
                animIndex = 0;
            }
            queueNick(renderNick(listNow[animIndex], lastParts || { title: '', artist: '', key: '' }));
            animIndex += 1;
        }, interval);
        log('idle animation started @ ' + interval + 'ms');
    }

    function cancelSwitchTimer() {
        if (switchTimer) {
            clearTimeout(switchTimer);
            switchTimer = null;
        }
    }

    function cancelPlayChatTimer() {
        if (playChatTimer) {
            clearTimeout(playChatTimer);
            playChatTimer = null;
        }
    }

    function chatPlayingOnce(parts) {
        if (config.chatAnnounce === false) {
            return;
        }
        var key = (parts.title || '') + '|' + (parts.artist || '');
        if (key === lastChatKey) {
            log('skip duplicate Now Playing chat');
            return;
        }
        // Never replace a good announce with Unknown
        if (lastChatKey) {
            var lastTitle = lastChatKey.split('|')[0];
            var lastArtist = lastChatKey.substring(lastTitle.length + 1);
            if (parts.title === lastTitle && parts.artist === 'Unknown' && lastArtist !== 'Unknown') {
                log('skip weaker Now Playing chat');
                return;
            }
        }
        lastChatKey = key;
        chat(render(cfg('chatPlayingTemplate', '🎵 Now Playing: %a - %t'), parts));
    }

    function schedulePlayingChat(parts) {
        cancelPlayChatTimer();
        var epoch = switchEpoch;
        var started = Date.now();
        var maxWait = numCfg('playChatDebounceMs', 3000, 500, 10000);
        var retryEvery = 400;

        function tryAnnounce() {
            playChatTimer = null;
            if (epoch !== switchEpoch) {
                return;
            }

            var latest = parts;
            try {
                var t = media.getCurrentTrack();
                if (t) {
                    latest = trackParts(t);
                }
            } catch (e) {}

            applyPlayingVisual(latest);

            if (metaReady(latest)) {
                chatPlayingOnce(latest);
                return;
            }

            if (Date.now() - started >= maxWait) {
                log('metadata wait timed out; announcing best-effort');
                chatPlayingOnce(latest);
                return;
            }

            log('waiting for metadata… artist=' + latest.artist + ' title=' + latest.title);
            playChatTimer = setTimeout(tryAnnounce, retryEvery);
        }

        // Small first delay, then retry until ready / timeout
        playChatTimer = setTimeout(tryAnnounce, Math.min(500, maxWait));
    }

    function applyPlayingVisual(parts) {
        stopAnim();
        refreshDescription('playing', parts);
        queueSongNick(cfg('songNickTemplate', '🎧 ♪ %t'), parts);
    }

    function applyStopped(doChat) {
        stopAnim();
        cancelPlayChatTimer();
        queueNick(renderNick(cfg('baseNick', '🎧 LÚCIO RADIO'), { title: '', artist: '', key: '' }));
        refreshDescription('stopped', { title: '', artist: '', key: '' });
        if (doChat && config.chatAnnounce !== false && config.announceStop !== false) {
            chat(cfg('chatStoppedTemplate', '⏹ Playback stopped'));
        }
        lastChatKey = '';
        startIdleAnim();
    }

    function applyPaused(parts, doChat) {
        stopAnim();
        cancelPlayChatTimer();
        queueSongNick(cfg('pausedNickTemplate', '⏸ ♪ %t'), parts);
        refreshDescription('paused', parts);
        if (doChat && config.chatAnnounce !== false && config.announcePause !== false) {
            chat(render(cfg('chatPausedTemplate', '⏸ Paused: %a - %t'), parts));
        }
    }

    function applyPlaying(parts, doChat) {
        applyPlayingVisual(parts);
        if (doChat) {
            schedulePlayingChat(parts);
        }
    }

    function commitStopOrPause(state, parts, epoch) {
        if (epoch !== switchEpoch) {
            return;
        }
        // If audio already playing again, this was a !next gap — ignore
        try {
            if (audio.isPlaying()) {
                log('suppress stop/pause — already playing again');
                return;
            }
        } catch (e) {}

        lastState = state;
        lastTrackKey = parts.key || '';
        lastParts = parts;
        if (state === 'paused') {
            applyPaused(parts, true);
        } else {
            applyStopped(true);
        }
    }

    /**
     * @param preferredState
     * @param trackHint
     * @param opts true = legacy force; or { force, chat }
     *   force: bypass duplicate skip (used on script reload sync)
     *   chat:  whether to announce in channel (false on reload — avoid re-spam)
     */
    function emitState(preferredState, trackHint, opts) {
        if (!config.enabled) {
            return;
        }

        var force = false;
        var doChat = true;
        if (opts === true) {
            force = true;
        } else if (opts && typeof opts === 'object') {
            force = opts.force === true;
            doChat = opts.chat !== false;
        }

        var playing = false;
        try {
            playing = !!audio.isPlaying();
        } catch (e) {
            playing = false;
        }

        var track = trackHint;
        if (!track || typeof track.title !== 'function') {
            try {
                track = media.getCurrentTrack();
            } catch (e2) {
                track = null;
            }
        }

        var parts = trackParts(track);
        var hasTrack = !!(parts.key || (track && (parts.title !== 'Unknown' || parts.artist !== 'Unknown')));

        var state = preferredState;
        if (!state) {
            if (playing) {
                state = 'playing';
            } else if (hasTrack) {
                state = 'paused';
            } else {
                state = 'stopped';
            }
        }

        if (state === 'playing' && !playing && hasTrack) {
            state = 'paused';
        }
        if (state === 'playing' && !playing && !hasTrack) {
            state = 'stopped';
        }
        if (state === 'paused' && playing) {
            state = 'playing';
        }
        if (state === 'stopped') {
            parts = { title: '', artist: '', key: '' };
        }

        var signature = state + '|' + (parts.key || '') + '|' + (parts.artist || '') + '|' + (parts.title || '');
        var lastSignature = lastState + '|' + lastTrackKey + '|' + (lastParts.artist || '') + '|' + (lastParts.title || '');

        // Same playing track with richer metadata: update visuals only, no new state fanout
        if (!force && state === 'playing' && lastState === 'playing' && parts.title && parts.title === lastParts.title) {
            if (parts.artist !== lastParts.artist || parts.key !== lastTrackKey) {
                lastTrackKey = parts.key || lastTrackKey;
                lastParts = parts;
                applyPlayingVisual(parts);
                log('metadata refresh for same title (no extra chat yet)');
            } else if (signature === lastSignature) {
                skipDupLogCount++;
                if (skipDupLogCount <= 2 || skipDupLogCount % 15 === 0) {
                    log('skip duplicate state: ' + signature + ' (x' + skipDupLogCount + ')');
                }
            }
            return;
        }

        if (!force && state === lastState && parts.key === lastTrackKey && parts.title === lastParts.title && parts.artist === lastParts.artist) {
            skipDupLogCount++;
            if (skipDupLogCount <= 2 || skipDupLogCount % 15 === 0) {
                log('skip duplicate state: ' + signature + ' (x' + skipDupLogCount + ')');
            }
            return;
        }
        skipDupLogCount = 0;

        // !next gap: playing -> stopped/paused -> playing
        // On silent reload sync, apply immediately (no grace / no chat)
        if (doChat && (state === 'stopped' || state === 'paused') && (lastState === 'playing' || switchTimer)) {
            cancelSwitchTimer();
            switchEpoch += 1;
            var epoch = switchEpoch;
            var grace = numCfg('trackSwitchGraceMs', 2500, 500, 10000);
            log('defer ' + state + ' for ' + grace + 'ms (track switch grace)');
            // Do not chat / idle-nick yet — wait to see if next track starts
            switchTimer = setTimeout(function () {
                switchTimer = null;
                commitStopOrPause(state, parts, epoch);
            }, grace);
            return;
        }

        if (state === 'playing') {
            cancelSwitchTimer();
            switchEpoch += 1;
            lastState = state;
            lastTrackKey = parts.key || '';
            lastParts = parts;
            lastVolume = getVolume();
            // Seed chat key on silent sync so a later identical announce is skipped
            if (!doChat) {
                lastChatKey = (parts.title || '') + '|' + (parts.artist || '');
            }
            log('state -> playing @ ' + parts.artist + ' - ' + parts.title + (doChat ? '' : ' (silent)'));
            applyPlaying(parts, doChat);
            return;
        }

        lastState = state;
        lastTrackKey = parts.key || '';
        lastParts = parts;
        lastVolume = getVolume();
        log('state -> ' + state + (parts.key ? (' @ ' + parts.artist + ' - ' + parts.title) : '') + ' vol=' + lastVolume + (doChat ? '' : ' (silent)'));

        if (state === 'paused') {
            applyPaused(parts, doChat);
        } else {
            applyStopped(doChat);
        }
    }

    function pollVolumeOnly() {
        var wantDesc = config.setDescription !== false && config.showVolumeInDesc === true;
        var wantNick = config.showVolumeInNick === true;
        if (!wantDesc && !wantNick) {
            return;
        }
        if (!clientReady) {
            return;
        }
        var vol = getVolume();
        if (lastVolume === null) {
            lastVolume = vol;
            return;
        }
        if (vol === lastVolume && pendingVolume === null) {
            return;
        }
        if (vol === lastVolume) {
            return;
        }

        // Debounce: wait until volume stops changing (AloneMode fade calls setVolume many times)
        pendingVolume = vol;
        scheduleVolumeSettle(wantDesc, wantNick);
    }

    function scheduleVolumeSettle(wantDesc, wantNick) {
        if (volTimer) {
            clearTimeout(volTimer);
        }
        var settle = numCfg('volumeSettleMs', 1200, 200, 15000);
        volTimer = setTimeout(function () {
            volTimer = null;
            var finalVol = getVolume();
            // Still moving (e.g. fade-in/out): re-arm until two samples match
            if (pendingVolume !== null && finalVol !== pendingVolume) {
                pendingVolume = finalVol;
                scheduleVolumeSettle(wantDesc, wantNick);
                return;
            }
            if (finalVol === lastVolume) {
                pendingVolume = null;
                return;
            }
            lastVolume = finalVol;
            pendingVolume = null;
            log('volume settled -> ' + finalVol + '%');
            if (wantDesc) {
                refreshDescription(lastState || 'stopped', lastParts);
            }
            if (wantNick) {
                refreshNickVisual();
            }
        }, settle);
    }

    function pollModeOnly() {
        var wantDesc = config.setDescription !== false && descModeEnabled();
        var wantNick = nickModeEnabled();
        if (!wantDesc && !wantNick) {
            return;
        }
        if (!clientReady) {
            return;
        }
        var rep = getRepeat();
        var shuf = getShuffle();
        if (lastRepeat === null) {
            lastRepeat = rep;
            lastShuffle = shuf;
            // First sample: still refresh so icon appears if already ON at load
            log('mode initial repeat=' + rep + ' shuffle=' + shuf + ' showNickRepeat=' + optFlag('showRepeatInNick', true));
            if (wantDesc) {
                refreshDescription(lastState || 'stopped', lastParts);
            }
            if (wantNick) {
                refreshNickVisual();
            }
            return;
        }
        if (rep === lastRepeat && shuf === lastShuffle) {
            return;
        }
        lastRepeat = rep;
        lastShuffle = shuf;
        log('mode changed repeat=' + rep + ' shuffle=' + shuf);
        engine.log('[LucioRadio] repeat=' + rep + ' shuffle=' + shuf + ' → refresh nick/desc');
        if (wantDesc) {
            refreshDescription(lastState || 'stopped', lastParts);
        }
        if (wantNick) {
            refreshNickVisual();
        }
    }

    function pollState() {
        if (!config.enabled || !clientReady) {
            return;
        }
        emitState(null, null, false);
        pollVolumeOnly();
        pollModeOnly();
    }

    function startPoll() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        var ms = numCfg('statePollMs', 2000, 1000, 10000);
        pollTimer = setInterval(pollState, ms);
        log('state poll @ ' + ms + 'ms');
    }

    function markReady() {
        if (!connected || clientReady) {
            return;
        }
        clientReady = true;
        lastVolume = getVolume();
        lastRepeat = getRepeat();
        lastShuffle = getShuffle();
        log('client ready — flushing queued updates (visual sync, no chat)');
        engine.log('[LucioRadio] ready api.isRepeat=' + apiRepeat() +
            ' displayRepeat=' + getRepeat() +
            ' showNickRepeat=' + wantShowRepeatNick() +
            ' local=' + repeatLocal);
        startPoll();
        // Restore engine repeat/shuffle after restart (core often resets to off)
        applyStoredModesToPlayer('ready');
        // Script save/reload: sync nick/desc only — do not re-announce Now Playing
        emitState(null, null, { force: true, chat: false });
        scheduleFlush();
    }

    function onConnected() {
        connected = true;
        clientReady = false;
        loadModeLocals();
        if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = null;
        }
        var settle = numCfg('connectSettleMs', 5000, 1000, 30000);
        log('connected — settle ' + settle + 'ms before ClientUpdate');
        settleTimer = setTimeout(function () {
            settleTimer = null;
            if (connected) {
                markReady();
            }
        }, settle);
    }

    function onDisconnected() {
        connected = false;
        clientReady = false;
        stopAnim();
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = null;
        }
        if (volTimer) {
            clearTimeout(volTimer);
            volTimer = null;
        }
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        cancelSwitchTimer();
        cancelPlayChatTimer();
        pendingNick = null;
        pendingDesc = null;
        pendingVolume = null;
        appliedNick = '';
        appliedDesc = '';
        lastState = '';
        lastTrackKey = '';
        lastVolume = null;
        lastRepeat = null;
        lastShuffle = null;
        // keep repeatLocal/shuffleLocal (also in store) across short disconnects
        skipDupLogCount = 0;
        lastParts = { title: '', artist: '', key: '' };
        lastChatKey = '';
        lastClientUpdateAt = 0;
        switchEpoch = 0;
    }

    function isModeCommand(text, name) {
        var t = String(text || '').trim().toLowerCase();
        if (!t) {
            return false;
        }
        var prefix = '!';
        try {
            prefix = String(engine.getCommandPrefix() || '!');
        } catch (e) {}
        var cmd = prefix.toLowerCase() + name;
        return t === cmd || t === '!' + name || t.indexOf(cmd + ' ') === 0;
    }

    event.on('chat', function (ev) {
        if (!config.enabled) {
            return;
        }
        var text = ev && ev.text;
        ingestStatusText(text);
        if (isModeCommand(text, 'repeat')) {
            handleRepeatCommand();
        } else if (isModeCommand(text, 'shuffle')) {
            handleShuffleCommand();
        }
    });

    try {
        event.on('poke', function (ev) {
            if (!config.enabled) {
                return;
            }
            ingestStatusText(ev && (ev.text || ev.msg || ev.message));
        });
    } catch (ePoke) {}

    event.on('track', function (ev) {
        var track = ev;
        if (!track || typeof track.title !== 'function') {
            track = media.getCurrentTrack();
        }
        emitState('playing', track, false);
    });

    event.on('trackEnd', function () {
        emitState('stopped', null, false);
    });

    event.on('disconnect', onDisconnected);

    event.on('connect', function () {
        if (!config.enabled) {
            return;
        }
        onConnected();
    });

    // Script load: do NOT call setNick yet (avoids updateNick Timeout during TS startup)
    if (config.enabled) {
        loadModeLocals();
        lastState = 'stopped';
        lastTrackKey = '';
        lastParts = { title: '', artist: '', key: '' };
        lastVolume = getVolume();
        if (isBotConnected()) {
            onConnected();
        }
        engine.log('[LucioRadio] v' + SCRIPT_VERSION + ' loaded — showRepeatInNick raw=' +
            config.showRepeatInNick + ' effective=' + wantShowRepeatNick() +
            ' api.isRepeat=' + apiRepeat() + ' localRepeat=' + repeatLocal);
    } else {
        engine.log('[LucioRadio] v' + SCRIPT_VERSION + ' loaded but disabled');
    }
});
