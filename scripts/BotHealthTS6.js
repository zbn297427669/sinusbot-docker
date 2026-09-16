/**
 * BotHealthTS6.js
 *
 * Chat commands to inspect SinusBot + TS connection health.
 *   !health   — full checklist (recommended)
 *   !botinfo  — short identity / playback snapshot
 *   !botping  — connection / ping / packet loss only
 *
 * Note: SinusBot scripts cannot see Docker/host RAM/CPU; this checks
 * what the scripting engine exposes (connect, ping, playback, channel).
 */

registerPlugin({
    name: 'Bot Health TS6',
    version: '1.0.0',
    backends: ['ts3', 'discord'],
    description: 'Commands !health / !botinfo / !botping — check bot + TS connection health.',
    author: 'local',
    vars: [{
        name: 'enabled',
        title: 'Enable script',
        type: 'checkbox',
        default: true
    }, {
        name: 'replyMode',
        title: 'Where to send the report',
        type: 'select',
        options: [
            'private chat to requester (recommended)',
            'channel chat (everyone sees)'
        ]
    }, {
        name: 'adminOnly',
        title: 'Only allow configured server groups (if empty list → everyone)',
        type: 'checkbox',
        default: false
    }, {
        name: 'adminGroupIds',
        title: 'Allowed server group IDs (comma-separated). Used when admin-only is ON.',
        type: 'string',
        placeholder: '75,6'
    }, {
        name: 'pingWarnMs',
        title: 'Ping WARN threshold (ms)',
        type: 'number',
        placeholder: '150'
    }, {
        name: 'pingFailMs',
        title: 'Ping FAIL threshold (ms)',
        type: 'number',
        placeholder: '400'
    }, {
        name: 'lossWarnPct',
        title: 'Packet loss WARN threshold (%)',
        type: 'number',
        placeholder: '2'
    }, {
        name: 'lossFailPct',
        title: 'Packet loss FAIL threshold (%)',
        type: 'number',
        placeholder: '8'
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
    const audio = require('audio')
    const media = require('media')

    const TAG = '[BotHealth TS6]'
    const enabled = config.enabled !== false
    const replyPrivate = String(config.replyMode == null ? '0' : config.replyMode) === '0'
    const adminOnly = config.adminOnly === true
    const debugLog = config.debugLog === true

    const pingWarn = Math.max(1, parseInt(config.pingWarnMs, 10) || 150)
    const pingFail = Math.max(pingWarn, parseInt(config.pingFailMs, 10) || 400)
    const lossWarn = Math.max(0, parseFloat(config.lossWarnPct) || 2)
    const lossFail = Math.max(lossWarn, parseFloat(config.lossFailPct) || 8)

    const adminGroups = String(config.adminGroupIds || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

    function log(msg) {
        if (debugLog) {
            engine.log(`${TAG} ${msg}`)
        }
    }

    function cmdPrefix() {
        try {
            return String(engine.getCommandPrefix() || '!')
        } catch (e) {
            return '!'
        }
    }

    function isCommand(text, name) {
        const t = String(text || '').trim().toLowerCase()
        if (!t) {
            return false
        }
        const p = cmdPrefix().toLowerCase()
        const a = p + name
        const b = '!' + name
        return t === a || t === b || t.indexOf(a + ' ') === 0 || t.indexOf(b + ' ') === 0
    }

    function clientAllowed(client) {
        if (!adminOnly || adminGroups.length === 0) {
            return true
        }
        if (!client) {
            return false
        }
        try {
            const groups = client.getServerGroups() || []
            for (let i = 0; i < groups.length; i++) {
                const id = String(groups[i].id())
                if (adminGroups.indexOf(id) !== -1) {
                    return true
                }
            }
        } catch (e) {
            log('group check failed: ' + e)
        }
        return false
    }

    function safe(fn, fallback) {
        try {
            const v = fn()
            return v == null ? fallback : v
        } catch (e) {
            return fallback
        }
    }

    function fmtMs(ms) {
        const n = Math.max(0, Math.floor(Number(ms) || 0))
        const s = Math.floor(n / 1000)
        const d = Math.floor(s / 86400)
        const h = Math.floor((s % 86400) / 3600)
        const m = Math.floor((s % 3600) / 60)
        const sec = s % 60
        if (d > 0) {
            return d + 'd ' + h + 'h ' + m + 'm'
        }
        if (h > 0) {
            return h + 'h ' + m + 'm'
        }
        if (m > 0) {
            return m + 'm ' + sec + 's'
        }
        return sec + 's'
    }

    function rate(level, ok, warn, fail) {
        // level: number where higher is worse for ping/loss
        if (level >= fail) {
            return 'FAIL'
        }
        if (level >= warn) {
            return 'WARN'
        }
        return 'OK'
    }

    function gather() {
        const connected = safe(() => !!backend.isConnected(), false)
        const bot = safe(() => backend.getBotClient(), null)
        const ch = safe(() => backend.getCurrentChannel(), null)

        const ping = bot ? safe(() => Number(bot.getPing()), -1) : -1
        const loss = bot ? safe(() => Number(bot.getPacketLoss()), -1) : -1
        const onlineMs = bot ? safe(() => Number(bot.getOnlineTime()), 0) : 0

        let humans = 0
        let listeners = 0
        let channels = 0
        try {
            const clients = backend.getClients() || []
            const botId = bot ? String(bot.id()) : ''
            for (let i = 0; i < clients.length; i++) {
                const c = clients[i]
                let self = false
                try {
                    self = typeof c.isSelf === 'function' && c.isSelf()
                } catch (e0) {}
                if (!self && String(c.id()) !== botId) {
                    humans++
                }
            }
        } catch (e1) {}

        try {
            channels = Number(backend.getChannelCount()) || 0
        } catch (e2) {}

        if (ch) {
            try {
                if (typeof ch.getClientCount === 'function') {
                    let total = Number(ch.getClientCount()) || 0
                    // TS6 often already excludes bot
                    listeners = Math.max(0, total)
                    if (bot && typeof ch.getClients === 'function') {
                        const list = ch.getClients() || []
                        let sawBot = false
                        for (let i = 0; i < list.length; i++) {
                            try {
                                if (list[i].isSelf && list[i].isSelf()) {
                                    sawBot = true
                                }
                            } catch (e3) {}
                        }
                        if (sawBot) {
                            listeners = Math.max(0, total - 1)
                        } else if (list.length > 0) {
                            listeners = list.filter(c => {
                                try {
                                    return !(c.isSelf && c.isSelf())
                                } catch (e4) {
                                    return true
                                }
                            }).length
                        }
                    }
                }
            } catch (e5) {}
        }

        const playing = safe(() => !!audio.isPlaying(), false)
        const muted = safe(() => !!audio.isMute(), false)
        const volume = safe(() => Math.round(Number(audio.getVolume()) || 0), 0)
        const repeat = safe(() => (typeof media.isRepeat === 'function' ? !!media.isRepeat() : false), false)
        const shuffle = safe(() => (typeof media.isShuffle === 'function' ? !!media.isShuffle() : false), false)
        const pos = safe(() => Number(audio.getTrackPosition()) || 0, 0)

        let title = ''
        let artist = ''
        let trackType = ''
        try {
            const t = media.getCurrentTrack()
            if (t) {
                title = (t.title && t.title()) || ''
                artist = (t.artist && t.artist()) || ''
                trackType = (t.type && t.type()) || ''
            }
        } catch (e6) {}

        let queueLen = -1
        try {
            if (typeof media.getQueue === 'function') {
                const q = media.getQueue()
                queueLen = q && typeof q.length === 'number' ? q.length : (Array.isArray(q) ? q.length : -1)
            }
        } catch (e7) {}

        const checks = []
        checks.push({
            name: 'TS connected',
            status: connected ? 'OK' : 'FAIL',
            detail: connected ? 'yes' : 'no'
        })

        if (connected && bot) {
            const pingStatus = ping < 0 ? 'WARN' : rate(ping, 0, pingWarn, pingFail)
            checks.push({
                name: 'Ping',
                status: pingStatus,
                detail: ping < 0 ? 'n/a' : (ping + ' ms')
            })
            const lossStatus = loss < 0 ? 'WARN' : rate(loss, 0, lossWarn, lossFail)
            checks.push({
                name: 'Packet loss',
                status: lossStatus,
                detail: loss < 0 ? 'n/a' : (loss + '%')
            })
        } else {
            checks.push({ name: 'Ping', status: 'FAIL', detail: 'no bot client' })
            checks.push({ name: 'Packet loss', status: 'FAIL', detail: 'no bot client' })
        }

        checks.push({
            name: 'In channel',
            status: ch ? 'OK' : 'WARN',
            detail: ch ? safe(() => ch.name(), '?') : 'none'
        })

        if (playing && muted) {
            checks.push({ name: 'Audio', status: 'WARN', detail: 'playing but muted' })
        } else if (playing && volume <= 0) {
            checks.push({ name: 'Audio', status: 'WARN', detail: 'playing at 0% volume' })
        } else if (playing) {
            checks.push({ name: 'Audio', status: 'OK', detail: 'playing @ ' + volume + '%' })
        } else {
            checks.push({ name: 'Audio', status: 'OK', detail: muted ? 'stopped/muted' : 'idle' })
        }

        let worst = 'OK'
        for (let i = 0; i < checks.length; i++) {
            if (checks[i].status === 'FAIL') {
                worst = 'FAIL'
                break
            }
            if (checks[i].status === 'WARN') {
                worst = 'WARN'
            }
        }

        return {
            worst,
            checks,
            meta: {
                version: safe(() => engine.version(), '?'),
                os: safe(() => engine.os(), '?'),
                backend: safe(() => engine.getBackend(), '?'),
                instanceId: safe(() => engine.getInstanceID(), '?'),
                nick: safe(() => (bot && bot.name()) || engine.getNick(), '?'),
                running: safe(() => !!engine.isRunning(), false),
                online: fmtMs(onlineMs),
                channel: ch ? safe(() => ch.name(), '?') : '-',
                humans,
                listeners,
                channels,
                playing,
                muted,
                volume,
                repeat,
                shuffle,
                pos: fmtMs(pos),
                title,
                artist,
                trackType,
                queueLen
            }
        }
    }

    function formatHealth(data) {
        const lines = []
        lines.push('Bot health: ' + data.worst)
        for (let i = 0; i < data.checks.length; i++) {
            const c = data.checks[i]
            lines.push('[' + c.status + '] ' + c.name + ': ' + c.detail)
        }
        const m = data.meta
        lines.push('---')
        lines.push('SinusBot ' + m.version + ' / ' + m.os + ' / ' + m.backend)
        lines.push('Nick: ' + m.nick + ' | online ' + m.online)
        lines.push('Channel: ' + m.channel + ' | listeners ' + m.listeners + ' | server humans ' + m.humans)
        lines.push('Vol ' + m.volume + '% mute=' + m.muted + ' repeat=' + m.repeat + ' shuffle=' + m.shuffle)
        if (m.playing && m.title) {
            lines.push('Now: ' + (m.artist ? m.artist + ' - ' : '') + m.title + ' (' + m.pos + ')')
        }
        if (m.queueLen >= 0) {
            lines.push('Queue: ' + m.queueLen)
        }
        return lines
    }

    function formatInfo(data) {
        const m = data.meta
        return [
            'Bot info [' + data.worst + ']',
            m.nick + ' | ' + m.backend + ' | SB ' + m.version,
            'Channel: ' + m.channel + ' | humans ' + m.humans + ' | listen ' + m.listeners,
            'Audio: ' + (m.playing ? 'playing' : 'idle') + ' @ ' + m.volume + '%' + (m.muted ? ' (muted)' : ''),
            m.title ? ('Track: ' + (m.artist ? m.artist + ' - ' : '') + m.title) : 'Track: -',
            'Online: ' + m.online
        ]
    }

    function formatPing(data) {
        const ping = data.checks.filter(c => c.name === 'Ping')[0]
        const loss = data.checks.filter(c => c.name === 'Packet loss')[0]
        const conn = data.checks.filter(c => c.name === 'TS connected')[0]
        return [
            'Bot ping [' + data.worst + ']',
            (conn ? conn.name + ': ' + conn.detail : ''),
            (ping ? ping.name + ' [' + ping.status + ']: ' + ping.detail : ''),
            (loss ? loss.name + ' [' + loss.status + ']: ' + loss.detail : ''),
            'Online: ' + data.meta.online
        ].filter(Boolean)
    }

    function reply(client, lines) {
        const text = lines.join('\n')
        if (replyPrivate && client && typeof client.chat === 'function') {
            try {
                client.chat(text)
                return
            } catch (e) {
                engine.log(`${TAG} private chat failed: ${e}`)
            }
        }
        try {
            backend.chat(text)
        } catch (e2) {
            engine.log(`${TAG} channel chat failed: ${e2}`)
        }
    }

    function handle(ev, kind) {
        if (!enabled) {
            return
        }
        const client = ev && ev.client
        if (!clientAllowed(client)) {
            reply(client, ['Bot health: denied (admin-only).'])
            return
        }
        const data = gather()
        log('cmd=' + kind + ' worst=' + data.worst)
        if (kind === 'info') {
            reply(client, formatInfo(data))
        } else if (kind === 'ping') {
            reply(client, formatPing(data))
        } else {
            reply(client, formatHealth(data))
        }
    }

    event.on('chat', (ev) => {
        const text = ev && ev.text
        if (isCommand(text, 'health') || isCommand(text, 'bothealth')) {
            handle(ev, 'health')
        } else if (isCommand(text, 'botinfo')) {
            handle(ev, 'info')
        } else if (isCommand(text, 'botping')) {
            handle(ev, 'ping')
        }
    })

    engine.log(`${TAG} v1.0.0 loaded — commands: ${cmdPrefix()}health | ${cmdPrefix()}botinfo | ${cmdPrefix()}botping`)
})
