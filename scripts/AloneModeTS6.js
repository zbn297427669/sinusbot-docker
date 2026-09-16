registerPlugin({
    name: 'AloneMode TS6',
    version: '1.5.6',
    backends: ['ts3', 'discord'],
    description: 'Auto mute/stop with debounce; stale-resume ignores brief !next gaps.',
    author: 'local',
    vars: [{
        name: 'mode',
        title: 'When music channel is empty',
        type: 'select',
        options: [
            'auto — mute for short AFK; stop in sleep window / long empty / server idle (recommended)',
            'pause — always stop now (YouTube restarts near beginning)',
            'mute first — mute then stop after idle minutes only (ignore sleep window)'
        ]
    }, {
        name: 'stopAfterAloneMinutes',
        title: 'Auto/mute: stop after music channel empty this many minutes (0 = never by timer). Default 30.',
        type: 'number',
        placeholder: '30'
    }, {
        name: 'serverIdleMinutes',
        title: 'Auto: if whole server has 0 humans this many minutes while muted, stop early (0 = off). Default 15.',
        type: 'number',
        placeholder: '15'
    }, {
        name: 'sleepStartHour',
        title: 'Auto sleep window start hour 0-23 (bot/host local time + offset). Same as end = sleep off. Default 1.',
        type: 'number',
        placeholder: '1'
    }, {
        name: 'sleepEndHour',
        title: 'Auto sleep window end hour 0-23 (exclusive). Default 9 → 01:00-09:00 stop immediately when empty.',
        type: 'number',
        placeholder: '9'
    }, {
        name: 'tzOffsetHours',
        title: 'Hours to add to host clock for sleep window (e.g. +8 if host is UTC and you want China time). Default 0.',
        type: 'number',
        placeholder: '0'
    }, {
        name: 'resumePausedOnJoin',
        title: 'If playback is paused/stopped but a track remains, resume when someone is in the channel (also after script reload). Default ON.',
        type: 'checkbox',
        default: true
    }, {
        name: 'staleResumeMinMs',
        title: 'Stale-resume only if not playing at least this long (ms). Avoids fighting !next track gaps. Default 3500.',
        type: 'number',
        placeholder: '3500'
    }, {
        name: 'seekOnResume',
        title: 'Seek to saved position on resume (after stop)',
        type: 'select',
        options: [
            'local files only (recommended)',
            'never (always restart from beginning)',
            'always (may break YouTube)'
        ]
    }, {
        name: 'seekDelayMs',
        title: 'Delay before seek on resume (ms, local files only)',
        type: 'number',
        placeholder: '1500'
    }, {
        name: 'aloneConfirmCount',
        title: 'Confirm alone this many times before empty grace (TS6 flickers empty)',
        type: 'number',
        placeholder: '3'
    }, {
        name: 'aloneGraceMs',
        title: 'Debounce: wait this long empty before mute/stop (ms). Default 10000.',
        type: 'number',
        placeholder: '10000'
    }, {
        name: 'resumeStableMs',
        title: 'Debounce: wait this long with listeners before resume (ms). Default 5000.',
        type: 'number',
        placeholder: '5000'
    }, {
        name: 'fadeInMs',
        title: 'Fade-in when sound returns (ms). 0 = off. Default 4500.',
        type: 'number',
        placeholder: '4500'
    }, {
        name: 'fadeOutMs',
        title: 'Fade-out when channel goes empty (ms). Starts immediately, ignores mute debounce. 0 = off. Default 3500.',
        type: 'number',
        placeholder: '3500'
    }, {
        name: 'debugLog',
        title: 'Debug logging (listener counts)',
        type: 'checkbox',
        default: false
    }]
}, (_, config) => {
    const engine = require('engine')
    const backend = require('backend')
    const event = require('event')
    const audio = require('audio')
    const media = require('media')

    const mode = String(config.mode == null ? '0' : config.mode)
    const seekMode = String(config.seekOnResume == null ? '0' : config.seekOnResume)
    // 0 = auto, 1 = pause, 2 = mute-first
    const AUTO = '0'
    const PAUSE = '1'
    const MUTE_FIRST = '2'
    const seekDelayMs = Math.max(500, parseInt(config.seekDelayMs, 10) || 1500)
    const aloneConfirmNeed = Math.max(1, Math.min(10, parseInt(config.aloneConfirmCount, 10) || 3))
    const aloneGraceRaw = parseInt(config.aloneGraceMs, 10)
    const aloneGraceMs = Number.isFinite(aloneGraceRaw)
        ? Math.max(0, Math.min(120000, aloneGraceRaw))
        : 10000
    const resumeStableRaw = parseInt(config.resumeStableMs, 10)
    const resumeStableMs = Number.isFinite(resumeStableRaw)
        ? Math.max(0, Math.min(120000, resumeStableRaw))
        : 5000
    const fadeInRaw = parseInt(config.fadeInMs, 10)
    const fadeInMs = Number.isFinite(fadeInRaw)
        ? Math.max(0, Math.min(20000, fadeInRaw))
        : 4500
    const fadeOutRaw = parseInt(config.fadeOutMs, 10)
    const fadeOutMs = Number.isFinite(fadeOutRaw)
        ? Math.max(0, Math.min(20000, fadeOutRaw))
        : 3500
    const stopAfterRaw = parseInt(config.stopAfterAloneMinutes, 10)
    const stopAfterAloneMinutes = Number.isFinite(stopAfterRaw)
        ? Math.max(0, Math.min(24 * 60, stopAfterRaw))
        : 30
    const stopAfterAloneMs = stopAfterAloneMinutes * 60 * 1000
    const serverIdleRaw = parseInt(config.serverIdleMinutes, 10)
    const serverIdleMinutes = Number.isFinite(serverIdleRaw)
        ? Math.max(0, Math.min(24 * 60, serverIdleRaw))
        : 15
    const serverIdleMs = serverIdleMinutes * 60 * 1000
    const sleepStartRaw = parseInt(config.sleepStartHour, 10)
    const sleepEndRaw = parseInt(config.sleepEndHour, 10)
    const sleepStartHour = Number.isFinite(sleepStartRaw) ? Math.max(0, Math.min(23, sleepStartRaw)) : 1
    const sleepEndHour = Number.isFinite(sleepEndRaw) ? Math.max(0, Math.min(23, sleepEndRaw)) : 9
    const tzRaw = parseInt(config.tzOffsetHours, 10)
    const tzOffsetHours = Number.isFinite(tzRaw) ? Math.max(-14, Math.min(14, tzRaw)) : 0
    const resumePausedOnJoin = config.resumePausedOnJoin !== false
    const staleResumeMinRaw = parseInt(config.staleResumeMinMs, 10)
    const staleResumeMinMs = Number.isFinite(staleResumeMinRaw)
        ? Math.max(500, Math.min(30000, staleResumeMinRaw))
        : 3500
    const debugLog = config.debugLog === true
    const TAG = '[AloneMode TS6]'

    let alone = false
    let aloneStreak = 0
    let stoppedWhileAlone = false
    let roomWasEmpty = false
    let staleResumeTried = false
    let notPlayingSince = null
    let staleResumeTimer = null
    let lastPosition = 0
    let lastTrack = null
    let lastUrl = ''
    let lastTitle = ''
    let lastType = ''
    let resumeTimer = null
    let verifyTimer = null
    let aloneConfirmTimer = null
    let aloneGraceTimer = null
    let resumeGraceTimer = null
    let stopAfterTimer = null
    let fadeTimer = null
    let serverEmptySince = null
    let savedVolume = 50
    let volumeCapturedForMute = false
    let earlyFadeOut = false

    audio.setMute(false)

    function dbg(msg) {
        if (debugLog) {
            engine.log(`${TAG} ${msg}`)
        }
    }

    function modeLabel() {
        if (mode === AUTO) {
            return 'auto'
        }
        if (mode === MUTE_FIRST) {
            return 'mute-first'
        }
        return 'pause'
    }

    function usesMutePath() {
        return mode === AUTO || mode === MUTE_FIRST
    }

    function localHour() {
        const h = new Date().getHours() + tzOffsetHours
        return ((h % 24) + 24) % 24
    }

    /** Sleep window enabled when start != end. End is exclusive. Supports wrap (e.g. 22→7). */
    function inSleepWindow() {
        if (mode !== AUTO) {
            return false
        }
        if (sleepStartHour === sleepEndHour) {
            return false
        }
        const h = localHour()
        if (sleepStartHour < sleepEndHour) {
            return h >= sleepStartHour && h < sleepEndHour
        }
        return h >= sleepStartHour || h < sleepEndHour
    }

    function getServerHumanCount() {
        try {
            if (typeof backend.getClients !== 'function') {
                return -1
            }
            const clients = backend.getClients() || []
            let n = 0
            for (let i = 0; i < clients.length; i++) {
                if (!isBotClient(clients[i])) {
                    n++
                }
            }
            return n
        } catch (e) {
            return -1
        }
    }

    function updateServerEmptyClock() {
        const n = getServerHumanCount()
        if (n === 0) {
            if (serverEmptySince == null) {
                serverEmptySince = Date.now()
            }
        } else if (n > 0) {
            serverEmptySince = null
        }
        return n
    }

    function serverIdleLongEnough() {
        if (mode !== AUTO || serverIdleMs <= 0) {
            return false
        }
        const n = updateServerEmptyClock()
        if (n !== 0 || serverEmptySince == null) {
            return false
        }
        return (Date.now() - serverEmptySince) >= serverIdleMs
    }

    /** Prefer hard stop (no mute) when entering alone. */
    function shouldHardStopNow() {
        if (mode === PAUSE) {
            return true
        }
        if (mode === AUTO && inSleepWindow()) {
            return true
        }
        if (mode === AUTO && serverIdleLongEnough()) {
            return true
        }
        return false
    }

    function hardStopReason() {
        if (mode === PAUSE) {
            return 'pause-mode'
        }
        if (inSleepWindow()) {
            return 'sleep-window'
        }
        if (serverIdleLongEnough()) {
            return 'server-idle'
        }
        return 'idle-timer'
    }

    function doHardStop(reason) {
        cancelFade()
        earlyFadeOut = false
        engine.log(`${TAG} stopping playback (${reason})`)
        savePlaybackState()
        try {
            media.stop()
        } catch (e) {
            engine.log(`${TAG} stop failed: ${e}`)
        }
        stoppedWhileAlone = true
        try {
            audio.setMute(false)
        } catch (e2) {}
        // Restore volume if a fade had zeroed it
        if (volumeCapturedForMute) {
            try {
                audio.setVolume(savedVolume)
            } catch (e3) {}
            volumeCapturedForMute = false
        }
    }

    function captureVolume() {
        // Never sample volume while a fade is in progress — that ratchets 18→3→1 permanently.
        if (earlyFadeOut || fadeTimer) {
            volumeCapturedForMute = true
            return
        }
        try {
            const raw = audio.getVolume()
            if (typeof raw === 'number' && raw > 0) {
                const v = Math.max(1, Math.min(100, Math.round(raw)))
                if (!volumeCapturedForMute) {
                    savedVolume = v
                } else if (v >= savedVolume) {
                    savedVolume = v
                } else if (v >= 10) {
                    // Allow intentional lower volume from !volume / Web, but ignore tiny mid-glitch values
                    savedVolume = v
                } else {
                    dbg(`captureVolume ignored low v=${v}, keep saved=${savedVolume}`)
                }
            }
        } catch (e) {}
        volumeCapturedForMute = true
    }

    function cancelFade() {
        if (fadeTimer) {
            clearInterval(fadeTimer)
            fadeTimer = null
        }
    }

    /**
     * Fade-out as soon as channel is empty — does NOT wait for mute/stop debounce.
     * If someone returns before mute, restoreFadeIn() brings volume back.
     */
    function startEarlyFadeOut() {
        if (fadeOutMs <= 0 || alone || earlyFadeOut) {
            return
        }
        cancelFade()
        captureVolume()
        earlyFadeOut = true

        const from = Math.max(savedVolume, 1)
        const steps = Math.max(16, Math.round(fadeOutMs / 60))
        const stepMs = Math.max(50, Math.round(fadeOutMs / steps))
        let step = 0

        engine.log(`${TAG} fade-out ${fadeOutMs}ms (immediate, no debounce) ${from} → 0 (saved=${savedVolume})`)
        fadeTimer = setInterval(() => {
            step++
            const t = step / steps
            // ease-out cubic: drop quickly at first, then settle
            const eased = 1 - Math.pow(1 - t, 3)
            const v = Math.round(from * (1 - eased))
            try {
                audio.setVolume(Math.max(0, v))
            } catch (e) {}
            if (step >= steps) {
                cancelFade()
                try {
                    audio.setVolume(0)
                } catch (e2) {}
                engine.log(`${TAG} fade-out done (waiting mute/stop debounce if any)`)
            }
        }, stepMs)
    }

    /** Restore volume after aborted empty / unmute (ease-in). */
    function unmuteWithFadeIn() {
        cancelFade()
        earlyFadeOut = false
        // Always restore to saved listening volume — never adopt a mid-fade low as the new target
        let target = Math.max(1, Math.min(100, savedVolume || 50))
        if (target < 5) {
            engine.log(`${TAG} savedVolume=${target} looks stuck low — using max(target,10); set !volume if wrong`)
            target = Math.max(target, 10)
            savedVolume = target
        }

        let from = 0
        try {
            const cur2 = audio.getVolume()
            if (typeof cur2 === 'number' && cur2 >= 0) {
                from = Math.min(target, Math.round(cur2))
            }
        } catch (e0) {}

        if (fadeInMs <= 0) {
            try {
                audio.setMute(false)
            } catch (e2) {}
            try {
                audio.setVolume(target)
            } catch (e3) {}
            volumeCapturedForMute = false
            return
        }

        const steps = Math.max(20, Math.round(fadeInMs / 60))
        const stepMs = Math.max(50, Math.round(fadeInMs / steps))
        let step = 0
        try {
            audio.setMute(false)
        } catch (e5) {}

        engine.log(`${TAG} fade-in ${fadeInMs}ms (~${steps} steps) ${from} → ${target}`)
        fadeTimer = setInterval(() => {
            step++
            const t = step / steps
            const eased = t * t * t
            const v = Math.round(from + (target - from) * eased)
            try {
                audio.setVolume(Math.min(target, Math.max(0, v)))
            } catch (e6) {}
            if (step >= steps) {
                cancelFade()
                try {
                    audio.setVolume(target)
                } catch (e7) {}
                volumeCapturedForMute = false
                engine.log(`${TAG} fade-in done (volume=${target})`)
            }
        }, stepMs)
    }

    /** Someone returned before mute — abort empty handling and restore sound. */
    function abortEmptyFade() {
        if (!earlyFadeOut && !volumeCapturedForMute) {
            return
        }
        engine.log(`${TAG} empty aborted — restoring volume (fade-in)`)
        unmuteWithFadeIn()
    }

    function botClientId() {
        try {
            const bot = backend.getBotClient()
            return bot ? bot.id() : null
        } catch (e) {
            return null
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
        const botId = botClientId()
        try {
            if (botId && client.id() === botId) {
                return true
            }
        } catch (e2) {}
        return false
    }

    /**
     * Listener count excluding the bot.
     * Returns >= 0 known, or -1 unknown (do not enter alone).
     *
     * TS6 quirk: getClientCount() often ALREADY excludes the bot.
     * Old logic did (total - 1), so 1 real user → 0 listeners → never resume.
     */
    function getListenerCount() {
        const channel = backend.getCurrentChannel()
        if (!channel) {
            return -1
        }

        let fromList = null
        let listLen = null
        let sawBotInList = false

        try {
            if (typeof channel.getClients === 'function') {
                const clients = channel.getClients() || []
                listLen = clients.length
                const botId = botClientId()
                let n = 0
                for (let i = 0; i < clients.length; i++) {
                    const c = clients[i]
                    if (!c) continue
                    let isBot = false
                    if (botId && c.id() === botId) {
                        isBot = true
                    } else {
                        try {
                            if (typeof c.isSelf === 'function' && c.isSelf()) {
                                isBot = true
                            }
                        } catch (e2) {}
                    }
                    if (isBot) {
                        sawBotInList = true
                        continue
                    }
                    n++
                }
                fromList = n
            }
        } catch (e) {}

        let total = null
        try {
            if (typeof channel.getClientCount === 'function') {
                total = channel.getClientCount()
                if (total == null) {
                    total = null
                }
            }
        } catch (e3) {}

        // Calibrate whether getClientCount includes the bot
        let fromCount = null
        if (total != null && total > 0) {
            if (fromList != null && listLen != null && listLen > 0) {
                if (total === fromList + 1 || (sawBotInList && total === listLen)) {
                    // count includes bot
                    fromCount = Math.max(0, total - 1)
                    dbg(`count includes bot: total=${total} → listeners=${fromCount}`)
                } else if (total === fromList || total === listLen) {
                    // count excludes bot (typical TS6)
                    fromCount = total
                    dbg(`count excludes bot: total=${total} → listeners=${fromCount}`)
                } else {
                    // Prefer not under-counting listeners (safer for resume)
                    fromCount = Math.max(fromList, total - 1, 0)
                    if (total > fromCount) {
                        fromCount = total
                    }
                    dbg(`count ambiguous: total=${total} list=${fromList} → listeners=${fromCount}`)
                }
            } else {
                // No usable list — on TS6 assume count excludes bot
                fromCount = total
                dbg(`no list, assume count excludes bot: listeners=${fromCount}`)
            }
        } else if (total === 0) {
            fromCount = 0
        }

        if (fromList != null && fromList > 0) {
            return fromList
        }
        if (fromCount != null && fromCount > 0) {
            return fromCount
        }
        if (fromList === 0 && fromCount === 0) {
            return 0
        }
        if (fromCount === 0 && (fromList == null || listLen === 0)) {
            // Empty list + zero count: alone OR visibility lag
            if (listLen === 0) {
                dbg('listener count unknown (empty getClients, count=0)')
                return -1
            }
            return 0
        }

        return -1
    }

    function isStreamUrl(url) {
        const u = String(url || '').toLowerCase()
        return u.indexOf('ytdl://') === 0 ||
            u.indexOf('http://') === 0 ||
            u.indexOf('https://') === 0 ||
            u.indexOf('radio://') === 0
    }

    function shouldSeek(url, type) {
        if (seekMode === '1') {
            return false
        }
        if (seekMode === '2') {
            return true
        }
        // local only (default)
        if (isStreamUrl(url)) {
            return false
        }
        if (type === 'ytdl' || type === 'url' || type === 'temp') {
            return false
        }
        return true
    }

    function extractPlayableUrl(raw) {
        const url = String(raw || '')
        if (!url) {
            return ''
        }
        if (url.indexOf('ytdl://') === 0) {
            return url
        }
        return url
    }

    function savePlaybackState() {
        lastPosition = 0
        lastTrack = null
        lastUrl = ''
        lastTitle = ''
        lastType = ''

        try {
            lastPosition = audio.getTrackPosition() || 0
        } catch (e) {}

        try {
            lastTrack = media.getCurrentTrack()
        } catch (e2) {
            lastTrack = null
        }

        if (lastTrack) {
            try {
                lastTitle = lastTrack.title() || ''
            } catch (e3) {}
            try {
                lastType = (lastTrack.type && lastTrack.type()) || ''
            } catch (e4) {}
            try {
                lastUrl = (lastTrack.url && lastTrack.url()) || ''
            } catch (e5) {}
            if (!lastUrl) {
                try {
                    lastUrl = (lastTrack.filename && lastTrack.filename()) || ''
                } catch (e6) {}
            }
        }

        engine.log(`${TAG} saved pos=${lastPosition} type=${lastType} title='${lastTitle}' url='${lastUrl}'`)
    }

    function clearPlaybackTimers() {
        if (resumeTimer) {
            clearTimeout(resumeTimer)
            resumeTimer = null
        }
        if (verifyTimer) {
            clearTimeout(verifyTimer)
            verifyTimer = null
        }
    }

    function clearTimers() {
        clearPlaybackTimers()
        cancelAlonePending()
        cancelResumePending()
        clearStopAfterTimer()
        cancelFade()
    }

    function cancelAlonePending() {
        aloneStreak = 0
        if (aloneConfirmTimer) {
            clearTimeout(aloneConfirmTimer)
            aloneConfirmTimer = null
        }
        if (aloneGraceTimer) {
            clearTimeout(aloneGraceTimer)
            aloneGraceTimer = null
        }
    }

    function cancelResumePending() {
        if (resumeGraceTimer) {
            clearTimeout(resumeGraceTimer)
            resumeGraceTimer = null
        }
    }

    function clearStopAfterTimer() {
        if (stopAfterTimer) {
            clearTimeout(stopAfterTimer)
            stopAfterTimer = null
        }
    }

    function scheduleStopAfterMute() {
        clearStopAfterTimer()
        if (!usesMutePath() || stopAfterAloneMs <= 0) {
            if (usesMutePath()) {
                engine.log(`${TAG} idle-timer off; will stop on sleep window / server-idle via poll`)
            }
            return
        }
        engine.log(`${TAG} will stop if still empty after ${stopAfterAloneMinutes} min (sleep/server-idle can stop sooner)`)
        stopAfterTimer = setTimeout(() => {
            stopAfterTimer = null
            if (!alone || stoppedWhileAlone) {
                return
            }
            if (getListenerCount() > 0) {
                return
            }
            doHardStop(hardStopReason())
        }, stopAfterAloneMs)
    }

    function maybeEscalateMutedToStop() {
        if (!alone || stoppedWhileAlone || !usesMutePath() || mode !== AUTO) {
            return
        }
        if (getListenerCount() > 0) {
            return
        }
        updateServerEmptyClock()
        if (inSleepWindow()) {
            clearStopAfterTimer()
            doHardStop('sleep-window')
            return
        }
        if (serverIdleLongEnough()) {
            clearStopAfterTimer()
            doHardStop('server-idle')
        }
    }

    function scheduleEnterAlone() {
        if (alone || aloneGraceTimer) {
            return
        }
        cancelResumePending()
        const action = shouldHardStopNow() ? 'stop' : (usesMutePath() ? 'mute' : 'stop')
        if (aloneGraceMs <= 0) {
            enterAlone()
            return
        }
        engine.log(`${TAG} alone confirmed — waiting ${aloneGraceMs}ms before ${action} (debounce)`)
        aloneGraceTimer = setTimeout(() => {
            aloneGraceTimer = null
            const listeners = getListenerCount()
            if (listeners > 0) {
                dbg(`empty debounce cancelled — listeners=${listeners}`)
                aloneStreak = 0
                return
            }
            if (listeners < 0) {
                aloneStreak = 0
                return
            }
            let playing = false
            try {
                playing = !!audio.isPlaying()
            } catch (e) {}
            if (!playing || alone) {
                return
            }
            enterAlone()
        }, aloneGraceMs)
    }

    function scheduleLeaveAlone(listeners) {
        if (!alone) {
            return
        }
        cancelAlonePending()
        if (resumeGraceTimer) {
            return
        }
        if (resumeStableMs <= 0) {
            leaveAlone(listeners)
            return
        }
        engine.log(`${TAG} listeners back (${listeners}) — waiting ${resumeStableMs}ms before resume (debounce)`)
        resumeGraceTimer = setTimeout(() => {
            resumeGraceTimer = null
            if (!alone) {
                return
            }
            const n = getListenerCount()
            if (n > 0) {
                leaveAlone(n)
            } else {
                dbg(`resume debounce cancelled — listeners=${n}`)
            }
        }, resumeStableMs)
    }

    function startPlayback(url, track) {
        const playable = extractPlayableUrl(url)
        try {
            if (playable && typeof media.playURL === 'function') {
                media.playURL(playable)
                return true
            }
            if (track && typeof track.play === 'function') {
                track.play()
                return true
            }
        } catch (e) {
            engine.log(`${TAG} play failed: ${e}`)
        }
        return false
    }

    function resumePlayback() {
        clearPlaybackTimers()

        const pos = lastPosition
        const track = lastTrack
        const url = lastUrl
        const type = lastType
        const doSeek = pos > 0 && shouldSeek(url, type)

        engine.log(`${TAG} resuming title='${lastTitle}' pos=${pos} seek=${doSeek} url='${url}'`)

        if (!startPlayback(url, track)) {
            engine.log(`${TAG} nothing to resume (no url/track)`)
            return
        }

        if (doSeek) {
            resumeTimer = setTimeout(() => {
                resumeTimer = null
                try {
                    audio.seek(pos)
                    engine.log(`${TAG} seek -> ${pos}`)
                } catch (e2) {
                    engine.log(`${TAG} seek failed: ${e2}`)
                }
            }, seekDelayMs)
        } else if (pos > 0) {
            engine.log(`${TAG} skip seek for stream/ytdl (would break decode); restarting near beginning`)
        }

        verifyTimer = setTimeout(() => {
            verifyTimer = null
            let playing = false
            try {
                playing = !!audio.isPlaying()
            } catch (e) {}
            if (playing) {
                engine.log(`${TAG} resume OK (playing)`)
                return
            }
            engine.log(`${TAG} resume not playing — retry once`)
            startPlayback(url, track)
        }, Math.max(seekDelayMs + 500, 2500))
    }

    function snapshotCurrentTrack() {
        lastPosition = 0
        lastTrack = null
        lastUrl = ''
        lastTitle = ''
        lastType = ''
        try {
            lastPosition = audio.getTrackPosition() || 0
        } catch (e) {}
        try {
            lastTrack = media.getCurrentTrack()
        } catch (e2) {
            lastTrack = null
        }
        if (!lastTrack) {
            return false
        }
        try {
            lastTitle = lastTrack.title() || ''
        } catch (e3) {}
        try {
            lastType = (lastTrack.type && lastTrack.type()) || ''
        } catch (e4) {}
        try {
            lastUrl = (lastTrack.url && lastTrack.url()) || ''
        } catch (e5) {}
        if (!lastUrl) {
            try {
                lastUrl = (lastTrack.filename && lastTrack.filename()) || ''
            } catch (e6) {}
        }
        return !!(lastUrl || lastTrack)
    }

    /**
     * Resume when room has listeners but player is paused/stopped with a track still loaded.
     * Covers: AloneMode stop then script reload (alone flag lost), or join after empty pause.
     * Must NOT run during brief !next / track-change gaps.
     */
    function tryResumeStalePaused(reason) {
        if (!resumePausedOnJoin || alone) {
            return false
        }
        let playing = false
        try {
            playing = !!audio.isPlaying()
        } catch (e) {}
        if (playing) {
            staleResumeTried = false
            notPlayingSince = null
            roomWasEmpty = false
            return false
        }
        const listeners = getListenerCount()
        if (listeners <= 0) {
            return false
        }

        // Only after a real empty-room stop / reload — never because !staleResumeTried alone
        const allow = reason === 'connect' ||
            reason === 'script-load' ||
            reason === 'client-join' ||
            reason === 'join-after-empty' ||
            roomWasEmpty
        if (!allow) {
            return false
        }

        if (!notPlayingSince) {
            notPlayingSince = Date.now()
            dbg('stale-resume arm notPlayingSince (' + reason + ')')
            if (staleResumeTimer) {
                clearTimeout(staleResumeTimer)
            }
            staleResumeTimer = setTimeout(() => {
                staleResumeTimer = null
                tryResumeStalePaused(reason)
            }, staleResumeMinMs + 100)
            return false
        }
        const waited = Date.now() - notPlayingSince
        if (waited < staleResumeMinMs) {
            dbg('stale-resume wait ' + waited + 'ms < ' + staleResumeMinMs + 'ms (' + reason + ')')
            return false
        }

        if (!snapshotCurrentTrack()) {
            dbg('stale-resume skip — no current track (' + reason + ')')
            return false
        }
        engine.log(`${TAG} stale pause → resume (${reason}, idle=${waited}ms) title='${lastTitle}'`)
        const shouldFade = volumeCapturedForMute || earlyFadeOut
        alone = false
        stoppedWhileAlone = false
        earlyFadeOut = false
        cancelAlonePending()
        cancelResumePending()
        clearStopAfterTimer()
        try {
            audio.setMute(false)
        } catch (eMute) {}
        if (shouldFade) {
            unmuteWithFadeIn()
        } else {
            try {
                const v = audio.getVolume()
                if (typeof v === 'number' && v <= 0 && savedVolume > 0) {
                    audio.setVolume(savedVolume)
                }
            } catch (eVol) {}
        }
        resumePlayback()
        roomWasEmpty = false
        staleResumeTried = true
        notPlayingSince = null
        return true
    }

    function markPlayingHealthy() {
        roomWasEmpty = false
        staleResumeTried = false
        notPlayingSince = null
        if (staleResumeTimer) {
            clearTimeout(staleResumeTimer)
            staleResumeTimer = null
        }
    }

    function enterAlone() {
        if (alone) {
            return
        }
        alone = true
        aloneStreak = 0
        stoppedWhileAlone = false
        cancelResumePending()
        updateServerEmptyClock()

        if (shouldHardStopNow()) {
            engine.log(`${TAG} empty stable → hard stop (${hardStopReason()})`)
            doHardStop(hardStopReason())
            return
        }

        if (usesMutePath()) {
            // Volume may already be 0 from early fade-out; just latch mute
            engine.log(`${TAG} empty stable → mute (YouTube-safe; will stop later if still empty)`)
            cancelFade()
            if (!volumeCapturedForMute) {
                captureVolume()
            }
            earlyFadeOut = false
            try {
                audio.setVolume(0)
            } catch (eVol) {}
            audio.setMute(true)
            scheduleStopAfterMute()
            return
        }

        engine.log(`${TAG} empty stable → pause/stop`)
        earlyFadeOut = false
        doHardStop('pause-mode')
    }

    function leaveAlone(listeners) {
        alone = false
        earlyFadeOut = false
        cancelAlonePending()
        cancelResumePending()
        clearStopAfterTimer()
        engine.log(`${TAG} ending (listeners=${listeners}, stopped=${stoppedWhileAlone})`)

        if (stoppedWhileAlone) {
            stoppedWhileAlone = false
            try {
                audio.setMute(false)
            } catch (eMute) {}
            if (volumeCapturedForMute) {
                try {
                    audio.setVolume(savedVolume)
                } catch (eVol) {}
                volumeCapturedForMute = false
            }
            resumePlayback()
        } else {
            stoppedWhileAlone = false
            unmuteWithFadeIn()
        }
    }

    function evaluate() {
        updateServerEmptyClock()

        const listeners = getListenerCount()
        const playing = (() => {
            try {
                return !!audio.isPlaying()
            } catch (e) {
                return false
            }
        })()

        dbg(`evaluate listeners=${listeners} playing=${playing} alone=${alone} streak=${aloneStreak} pauseDebounce=${!!aloneGraceTimer} resumeDebounce=${!!resumeGraceTimer} stopped=${stoppedWhileAlone} earlyFade=${earlyFadeOut} sleep=${inSleepWindow()} serverHumans=${getServerHumanCount()}`)

        // Unknown: never enter alone. If already alone, keep waiting (clientMove may force resume).
        if (listeners < 0) {
            return
        }

        if (listeners > 0) {
            cancelAlonePending()
            if (playing) {
                markPlayingHealthy()
            } else if (!notPlayingSince) {
                notPlayingSince = Date.now()
            }
            if (alone) {
                scheduleLeaveAlone(listeners)
            } else {
                // Returned during fade-out / empty debounce — restore immediately (no resume debounce)
                abortEmptyFade()
                if (usesMutePath()) {
                    try {
                        audio.setMute(false)
                    } catch (eMute) {}
                }
                // Only after sustained pause + prior empty room (not during !next gaps)
                if (!playing && resumePausedOnJoin && roomWasEmpty) {
                    tryResumeStalePaused('join-after-empty')
                }
            }
            return
        }

        // listeners === 0 — cancel any pending resume (AFK hop out again)
        cancelResumePending()
        roomWasEmpty = true
        staleResumeTried = false
        notPlayingSince = null

        if (alone) {
            cancelAlonePending()
            maybeEscalateMutedToStop()
            return
        }
        if (!playing) {
            cancelAlonePending()
            return
        }

        // Fade-out immediately (does not wait for confirm/grace)
        startEarlyFadeOut()

        // Already waiting in empty debounce — don't restart the timer
        if (aloneGraceTimer) {
            return
        }

        aloneStreak++
        dbg(`alone candidate ${aloneStreak}/${aloneConfirmNeed}`)

        if (aloneStreak < aloneConfirmNeed) {
            if (!aloneConfirmTimer) {
                aloneConfirmTimer = setTimeout(() => {
                    aloneConfirmTimer = null
                    evaluate()
                }, 600)
            }
            return
        }

        scheduleEnterAlone()
    }

    event.on('clientMove', (ev) => {
        setTimeout(() => {
            try {
                const botCh = backend.getCurrentChannel()
                if (botCh && ev && ev.toChannel && ev.client && !isBotClient(ev.client)) {
                    if (String(ev.toChannel.id()) === String(botCh.id())) {
                        if (alone) {
                            engine.log(`${TAG} client joined our channel — scheduling resume`)
                            scheduleLeaveAlone(1)
                            return
                        }
                        // Joined during empty debounce / early fade-out
                        cancelAlonePending()
                        abortEmptyFade()
                        tryResumeStalePaused('client-join')
                        return
                    }
                }
            } catch (e) {
                dbg('clientMove check failed: ' + e)
            }
            evaluate()
        }, 500)
    })
    try {
        event.on('clientVisible', () => setTimeout(evaluate, 500))
    } catch (e) {}

    event.on('connect', () => {
        alone = false
        stoppedWhileAlone = false
        earlyFadeOut = false
        roomWasEmpty = false
        staleResumeTried = false
        notPlayingSince = null
        serverEmptySince = null
        clearTimers()
        setTimeout(() => {
            evaluate()
            // After connect, allow one delayed stale resume if still idle
            notPlayingSince = Date.now() - staleResumeMinMs
            roomWasEmpty = true
            tryResumeStalePaused('connect')
        }, 2500)
    })

    setInterval(() => {
        evaluate()
    }, 5000)

    // Safety: never start muted after script reload
    try {
        audio.setMute(false)
    } catch (e0) {}

    // Script hot-reload: if people are already here and player is paused, resume after min idle
    setTimeout(() => {
        notPlayingSince = Date.now() - staleResumeMinMs
        roomWasEmpty = true
        tryResumeStalePaused('script-load')
    }, 3000)

    engine.log(
        `${TAG} v1.5.6 loaded (mode=${modeLabel()}, sleep=${sleepStartHour}-${sleepEndHour} tzOffset=${tzOffsetHours}, ` +
        `stopAfterMin=${stopAfterAloneMinutes}, serverIdleMin=${serverIdleMinutes}, ` +
        `fadeInMs=${fadeInMs}, fadeOutMs=${fadeOutMs}, resumePausedOnJoin=${resumePausedOnJoin}, ` +
        `staleResumeMinMs=${staleResumeMinMs}, ` +
        `pauseDebounceMs=${aloneGraceMs}, resumeDebounceMs=${resumeStableMs})`
    )
})

