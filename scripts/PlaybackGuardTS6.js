/**
 * PlaybackGuardTS6.js
 *
 * Playback reliability for YouTube/ytdl — does NOT replace AloneMode / LucioRadio.
 *
 * - !resume on stream: proactive playURL restart (core seek-resume is unreliable)
 * - !next: event-driven recover (cancel if new track starts; playNext only on timeout)
 * - Optional: ytdl stall → playNext (local files never auto-skipped)
 *
 * Empty channel: zero intervention (AloneMode owns mute/stop).
 * Does not register resume/next commands — only observes chat after the core runs.
 */

registerPlugin({
    name: 'Playback Guard TS6',
    version: '1.0.1',
    backends: ['ts3', 'discord'],
    description: 'Recover dead !resume/!next on ytdl; optional stall skip. Safe alongside AloneMode.',
    author: 'local',
    vars: [{
        name: 'enabled',
        title: 'Enable script',
        type: 'checkbox',
        default: true
    }, {
        name: 'resumeDelayMs',
        title: '!resume stream restart delay (ms). Default 400.',
        type: 'number',
        placeholder: '400'
    }, {
        name: 'nextTimeoutMs',
        title: '!next recover timeout (ms). Cancel if new track plays sooner. Default 10000.',
        type: 'number',
        placeholder: '10000'
    }, {
        name: 'stallSkipMs',
        title: 'Auto-skip ytdl if position stuck this long (ms). 0 = off. Default 25000.',
        type: 'number',
        placeholder: '25000'
    }, {
        name: 'stallCooldownMs',
        title: 'Min ms between stall skips. Default 60000.',
        type: 'number',
        placeholder: '60000'
    }, {
        name: 'announce',
        title: 'Announce recoveries in channel (default OFF)',
        type: 'checkbox',
        default: false
    }, {
        name: 'debugLog',
        title: 'Debug logging',
        type: 'checkbox',
        default: false
    }]
}, (_, config) => {
    const engine = require('engine')
    const backend = require('backend')
    const event = require('event')
    const media = require('media')
    const audio = require('audio')

    const TAG = '[PlaybackGuard TS6]'
    const enabled = config.enabled !== false
    const announce = config.announce === true
    const debugLog = config.debugLog === true

    const resumeDelayMs = clampInt(config.resumeDelayMs, 400, 0, 5000)
    const nextTimeoutMs = clampInt(config.nextTimeoutMs, 10000, 3000, 60000)
    const stallSkipMs = clampInt(config.stallSkipMs, 25000, 0, 300000)
    const stallCooldownMs = clampInt(config.stallCooldownMs, 60000, 5000, 600000)

    let savedVolume = 20
    let lastStallSkipAt = 0
    let stallPos = -1
    let stallPosSince = 0
    let stallUrl = ''

    /** @type {{ timer: any, poll: any, key: string, url: string }|null} */
    let nextWatch = null
    let resumeTimer = null

    function clampInt(raw, fallback, min, max) {
        const n = parseInt(raw, 10)
        if (!Number.isFinite(n)) {
            return fallback
        }
        return Math.max(min, Math.min(max, n))
    }

    function log(msg) {
        if (debugLog) {
            engine.log(TAG + ' ' + msg)
        }
    }

    function info(msg) {
        engine.log(TAG + ' ' + msg)
    }

    function cmdPrefix() {
        try {
            return String(engine.getCommandPrefix() || '!')
        } catch (e) {
            return '!'
        }
    }

    function isBotClient(client) {
        if (!client) {
            return true
        }
        try {
            if (typeof client.isSelf === 'function' && client.isSelf()) {
                return true
            }
        } catch (e) {}
        return false
    }

    /**
     * Human listeners in bot channel. >=0 known, -1 unknown (treat as do not intervene).
     */
    function getListenerCount() {
        const channel = backend.getCurrentChannel()
        if (!channel) {
            return -1
        }
        try {
            if (typeof channel.getClients === 'function') {
                const clients = channel.getClients() || []
                let n = 0
                for (let i = 0; i < clients.length; i++) {
                    if (!isBotClient(clients[i])) {
                        n++
                    }
                }
                return n
            }
        } catch (e) {}
        try {
            if (typeof channel.getClientCount === 'function') {
                const total = Number(channel.getClientCount())
                if (!Number.isFinite(total)) {
                    return -1
                }
                return Math.max(0, total)
            }
        } catch (e2) {}
        return -1
    }

    function roomHasListeners() {
        return getListenerCount() > 0
    }

    function isPlaying() {
        try {
            return !!audio.isPlaying()
        } catch (e) {
            return false
        }
    }

    function trackPosition() {
        try {
            return Number(audio.getTrackPosition()) || 0
        } catch (e) {
            return 0
        }
    }

    function isStreamUrl(url) {
        const u = String(url || '').toLowerCase()
        return u.indexOf('ytdl://') === 0 ||
            u.indexOf('http://') === 0 ||
            u.indexOf('https://') === 0 ||
            u.indexOf('radio://') === 0
    }

    function isStreamType(type) {
        const t = String(type || '').toLowerCase()
        return t === 'ytdl' || t === 'url' || t === 'temp'
    }

    function snapshotTrack() {
        const snap = { title: '', type: '', url: '', key: '', stream: false }
        let track = null
        try {
            track = media.getCurrentTrack()
        } catch (e) {
            track = null
        }
        if (!track) {
            return snap
        }
        try {
            snap.title = (track.title && track.title()) || ''
        } catch (e1) {}
        try {
            snap.type = (track.type && track.type()) || ''
        } catch (e2) {}
        try {
            snap.url = (track.url && track.url()) || ''
        } catch (e3) {}
        if (!snap.url) {
            try {
                snap.url = (track.filename && track.filename()) || ''
            } catch (e4) {}
        }
        snap.key = (snap.url || '') + '|' + (snap.title || '')
        snap.stream = isStreamUrl(snap.url) || isStreamType(snap.type)
        return snap
    }

    function captureVolume() {
        try {
            const v = Number(audio.getVolume())
            if (Number.isFinite(v) && v > 0) {
                savedVolume = Math.max(1, Math.min(100, Math.round(v)))
            }
        } catch (e) {}
    }

    function unmuteRestore() {
        try {
            audio.setMute(false)
        } catch (e) {}
        try {
            const v = Number(audio.getVolume())
            if (!Number.isFinite(v) || v <= 0) {
                audio.setVolume(savedVolume > 0 ? savedVolume : 20)
            }
        } catch (e2) {}
    }

    function playUrl(url) {
        const u = String(url || '')
        if (!u || typeof media.playURL !== 'function') {
            return false
        }
        try {
            media.playURL(u)
            return true
        } catch (e) {
            info('playURL failed: ' + e)
            return false
        }
    }

    function playNext() {
        try {
            if (typeof media.playNext === 'function') {
                media.playNext()
                return true
            }
        } catch (e) {
            info('playNext failed: ' + e)
        }
        return false
    }

    function hardStop() {
        try {
            if (typeof media.stop === 'function') {
                media.stop()
            }
        } catch (e) {}
    }

    function trackUrl(track) {
        if (!track) {
            return ''
        }
        try {
            const u = (track.url && track.url()) || ''
            if (u) {
                return u
            }
        } catch (e) {}
        try {
            return (track.filename && track.filename()) || ''
        } catch (e2) {
            return ''
        }
    }

    function trackTitle(track) {
        try {
            return (track && track.title && track.title()) || ''
        } catch (e) {
            return ''
        }
    }

    /**
     * When playNext is a no-op (stuck player / dead ytdl), force a playlist track.
     * Prefers index after the watched URL; falls back to a random track.
     */
    function forcePlaylistAdvance(preferUrl) {
        let pl = null
        try {
            if (typeof media.getActivePlaylist === 'function') {
                pl = media.getActivePlaylist()
            }
        } catch (e) {
            pl = null
        }
        if (!pl || typeof pl.getTracks !== 'function') {
            return false
        }
        let tracks = []
        try {
            tracks = pl.getTracks() || []
        } catch (e2) {
            return false
        }
        if (!tracks.length) {
            return false
        }

        let idx = -1
        const want = String(preferUrl || '')
        if (want) {
            for (let i = 0; i < tracks.length; i++) {
                if (trackUrl(tracks[i]) === want) {
                    idx = i
                    break
                }
            }
        }
        let nextIdx = idx >= 0 ? (idx + 1) % tracks.length : Math.floor(Math.random() * tracks.length)
        if (tracks.length > 1 && nextIdx === idx) {
            nextIdx = (nextIdx + 1) % tracks.length
        }

        const track = tracks[nextIdx]
        const url = trackUrl(track)
        info('playlist force idx=' + nextIdx + '/' + tracks.length + ' title=\'' + trackTitle(track) + '\'')

        try {
            if (typeof media.playlistPlayByID === 'function') {
                media.playlistPlayByID(pl, nextIdx)
                return true
            }
        } catch (e3) {
            info('playlistPlayByID failed: ' + e3)
        }
        try {
            if (track && typeof track.play === 'function') {
                track.play()
                return true
            }
        } catch (e4) {
            info('track.play failed: ' + e4)
        }
        if (url) {
            return playUrl(url)
        }
        return false
    }

    function verifyPlayingSoon(label, onDead) {
        setTimeout(() => {
            if (!roomHasListeners()) {
                return
            }
            if (isPlaying() && trackPosition() >= 0) {
                // Still may be buffering at pos 0 — accept isPlaying
                if (isPlaying()) {
                    info(label + ' verify OK (playing)')
                    return
                }
            }
            if (isPlaying()) {
                info(label + ' verify OK (playing)')
                return
            }
            info(label + ' verify DEAD — retry')
            if (typeof onDead === 'function') {
                onDead()
            }
        }, 3500)
    }

    function announceMsg(msg) {
        if (!announce) {
            return
        }
        try {
            const ch = backend.getCurrentChannel()
            if (ch && typeof ch.chat === 'function') {
                ch.chat(msg)
                return
            }
        } catch (e) {}
        try {
            backend.chat(msg)
        } catch (e2) {}
    }

    function parseModeCommand(text, name) {
        const prefix = cmdPrefix()
        const t = String(text || '').trim()
        if (!t) {
            return false
        }
        const re = new RegExp('^' + escapeRegExp(prefix) + name + '(?:\\s|$)', 'i')
        return re.test(t)
    }

    function escapeRegExp(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    function clearResumeTimer() {
        if (resumeTimer) {
            clearTimeout(resumeTimer)
            resumeTimer = null
        }
    }

    function clearNextWatch() {
        if (!nextWatch) {
            return
        }
        if (nextWatch.timer) {
            clearTimeout(nextWatch.timer)
        }
        if (nextWatch.poll) {
            clearInterval(nextWatch.poll)
        }
        nextWatch = null
    }

    function handleResumeCommand() {
        clearResumeTimer()
        if (!roomHasListeners()) {
            log('!resume ignored — empty channel (AloneMode owns this)')
            return
        }
        captureVolume()
        const before = snapshotTrack()
        resumeTimer = setTimeout(() => {
            resumeTimer = null
            if (!roomHasListeners()) {
                log('!resume abort — room empty after delay')
                return
            }
            const snap = snapshotTrack()
            const url = snap.url || before.url
            const stream = snap.stream || before.stream || isStreamUrl(url)
            if (!stream) {
                log('!resume leave to core (local file)')
                return
            }
            if (!url) {
                info('!resume recover skipped — no stream url')
                return
            }
            unmuteRestore()
            if (playUrl(url)) {
                info('!resume recover → playURL restart title=\'' + (snap.title || before.title) + '\'')
                announceMsg('[PlaybackGuard] stream resume → restart track')
                stallPos = -1
                stallPosSince = 0
            }
        }, resumeDelayMs)
    }

    function nextRecoverSuccess(reason) {
        log('!next OK (' + reason + ') — cancel recover')
        clearNextWatch()
    }

    function nextRecoverFail() {
        const watch = nextWatch
        clearNextWatch()
        if (!watch) {
            return
        }
        if (!roomHasListeners()) {
            log('!next recover skipped — empty channel')
            return
        }
        unmuteRestore()
        const snap = snapshotTrack()
        // Stuck decoder: stop first so playNext / playlistPlay is not a no-op
        hardStop()

        let method = ''
        let ok = false
        if (playNext()) {
            ok = true
            method = 'playNext'
        }
        if (!ok && forcePlaylistAdvance(watch.url || snap.url)) {
            ok = true
            method = 'playlist'
        }
        if (!ok) {
            const url = snap.url || watch.url
            if (url && (snap.stream || isStreamUrl(url) || watch.url)) {
                ok = playUrl(url)
                method = 'playURL'
            }
        }

        if (ok) {
            info('!next recover → ' + method + ' (will verify)')
            announceMsg('[PlaybackGuard] next recover')
            stallPos = -1
            stallPosSince = 0
            verifyPlayingSoon('!next/' + method, () => {
                if (!roomHasListeners()) {
                    return
                }
                unmuteRestore()
                hardStop()
                if (forcePlaylistAdvance(watch.url || snap.url)) {
                    info('!next recover retry → playlist')
                } else if (watch.url && playUrl(watch.url)) {
                    info('!next recover retry → playURL old')
                } else {
                    info('!next recover retry exhausted')
                }
            })
        } else {
            info('!next recover failed (no playNext/playlist/url)')
        }
    }

    function handleNextCommand() {
        clearNextWatch()
        if (!roomHasListeners()) {
            log('!next ignored — empty channel')
            return
        }
        captureVolume()
        const before = snapshotTrack()
        const started = Date.now()
        nextWatch = {
            timer: null,
            poll: null,
            key: before.key,
            url: before.url
        }
        nextWatch.poll = setInterval(() => {
            if (!nextWatch) {
                return
            }
            if (!roomHasListeners()) {
                clearNextWatch()
                return
            }
            const snap = snapshotTrack()
            const playing = isPlaying()
            const keyChanged = !!(snap.key && snap.key !== before.key)
            const pos = trackPosition()
            if (keyChanged && playing) {
                nextRecoverSuccess('new track playing')
                return
            }
            if (playing && pos > 500 && (keyChanged || !before.key)) {
                nextRecoverSuccess('playing with progress')
                return
            }
            if (Date.now() - started >= nextTimeoutMs) {
                if (!playing || (!keyChanged && pos <= 500)) {
                    nextRecoverFail()
                } else {
                    nextRecoverSuccess('timeout but alive')
                }
            }
        }, 1000)
        nextWatch.timer = setTimeout(() => {
            if (!nextWatch) {
                return
            }
            const snap = snapshotTrack()
            const playing = isPlaying()
            const keyChanged = !!(snap.key && snap.key !== before.key)
            if (keyChanged && playing) {
                nextRecoverSuccess('timeout track ok')
                return
            }
            if (!playing || (!keyChanged && trackPosition() <= 500)) {
                nextRecoverFail()
            } else {
                nextRecoverSuccess('timeout alive')
            }
        }, nextTimeoutMs + 50)
        log('!next watch armed key=' + before.key + ' timeout=' + nextTimeoutMs + 'ms')
    }

    function checkStall() {
        if (stallSkipMs <= 0) {
            return
        }
        if (!roomHasListeners()) {
            stallPos = -1
            stallPosSince = 0
            return
        }
        if (!isPlaying()) {
            stallPos = -1
            stallPosSince = 0
            return
        }
        const snap = snapshotTrack()
        if (!snap.stream) {
            stallPos = -1
            stallPosSince = 0
            return
        }
        const pos = trackPosition()
        const now = Date.now()
        if (stallPos < 0 || snap.url !== stallUrl || Math.abs(pos - stallPos) > 200) {
            stallPos = pos
            stallUrl = snap.url
            stallPosSince = now
            return
        }
        if (now - stallPosSince < stallSkipMs) {
            return
        }
        if (now - lastStallSkipAt < stallCooldownMs) {
            return
        }
        lastStallSkipAt = now
        stallPos = -1
        stallPosSince = 0
        info('stall skip → playNext title=\'' + snap.title + '\' stuckPos=' + pos)
        unmuteRestore()
        if (playNext()) {
            announceMsg('[PlaybackGuard] stalled stream → next')
        }
    }

    if (!enabled) {
        engine.log(TAG + ' disabled')
        return
    }

    event.on('chat', (ev) => {
        if (!ev || !ev.text || isBotClient(ev.client)) {
            return
        }
        const text = String(ev.text || '')
        if (parseModeCommand(text, 'resume')) {
            handleResumeCommand()
            return
        }
        if (parseModeCommand(text, 'next')) {
            handleNextCommand()
        }
    })

    event.on('track', () => {
        if (!nextWatch) {
            captureVolume()
            return
        }
        setTimeout(() => {
            if (!nextWatch) {
                return
            }
            const snap = snapshotTrack()
            if (snap.key && snap.key !== nextWatch.key && isPlaying()) {
                nextRecoverSuccess('track event')
            }
        }, 400)
        captureVolume()
    })

    setInterval(() => {
        if (isPlaying()) {
            captureVolume()
        }
        checkStall()
    }, 5000)

    engine.log(
        TAG + ' v1.0.1 loaded (resumeDelay=' + resumeDelayMs +
        ' nextTimeout=' + nextTimeoutMs +
        ' stallSkip=' + stallSkipMs +
        ' announce=' + announce + ')'
    )
})
