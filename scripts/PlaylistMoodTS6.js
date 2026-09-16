/**
 * PlaylistMoodTS6.js
 *
 * Map chat moods to playlists by name keywords, then let the user pick one.
 *
 * Examples (default mapping):
 *   !sleep  → list playlists whose names contain sleep/relax/night/...
 *   !work   → work/office/...
 *   !study  → study/learn/...
 *   !focus  → focus/deep/...
 *   !moods  → show configured mood commands + matched playlist counts
 *
 * After a list is shown, reply with a number (1) or the playlist name.
 *
 * Requires Command Library (command.js) so !focus etc. are real commands
 * and SinusBot does not reply "There is no enabled command named …".
 */

registerPlugin({
    name: 'Playlist Mood TS6',
    version: '1.0.3',
    engine: '>= 0.9.16',
    backends: ['ts3', 'discord'],
    description: 'Commands !sleep/!work/!study/!focus via Command Library: list matching playlists, reply to switch.',
    author: 'local',
    vars: [{
        name: 'enabled',
        title: 'Enable script',
        type: 'checkbox',
        default: true
    }, {
        name: 'moodMap',
        title: 'Mood map (one per line): command|keyword1,keyword2  — playlist name contains any keyword (case-insensitive)',
        type: 'multiline',
        placeholder:
            'sleep|sleep,relax,calm,night,chill,ambient\n' +
            'work|work,office,productivity\n' +
            'study|study,learn,homework,reading\n' +
            'focus|focus,deep,concentration,flow'
    }, {
        name: 'replyPrivate',
        title: 'Reply in private chat (default OFF = reply in channel)',
        type: 'checkbox',
        default: false
    }, {
        name: 'selectTimeoutSec',
        title: 'Seconds to wait for a selection reply',
        type: 'number',
        placeholder: '60'
    }, {
        name: 'clearQueueOnSwitch',
        title: 'Clear queue when switching playlist',
        type: 'checkbox',
        default: true
    }, {
        name: 'autoPlay',
        title: 'Start playing after switch (recommended)',
        type: 'checkbox',
        default: true
    }, {
        name: 'randomStartWhenShuffle',
        title: 'When Shuffle is ON, start at a random track (and re-bump shuffle). Fixes SinusBot always starting at #1 with a sticky order.',
        type: 'checkbox',
        default: true
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

    const TAG = '[PlaylistMood TS6]'
    const enabled = config.enabled !== false
    // Opt-in private; default / unchecked = channel (群里) reply
    const replyPrivate = config.replyPrivate === true
    const clearQueueOnSwitch = config.clearQueueOnSwitch !== false
    const autoPlay = config.autoPlay !== false
    const randomStartWhenShuffle = config.randomStartWhenShuffle !== false
    const debugLog = config.debugLog === true
    const selectTimeoutMs = Math.max(15, Math.min(300, parseInt(config.selectTimeoutSec, 10) || 60)) * 1000

    /** @type {Object.<string, string[]>} command -> keywords */
    let moodMap = {}
    /** @type {Object.<string, {list: any[], expires: number, timer: any, channel: any}>} */
    const pending = {}
    /** When true, moods are registered with command.js — do not also handle !mood via raw chat. */
    let commandsRegistered = false
    /** Last public reply target from command/chat (channel preferred). */
    let lastPublicChannel = null

    function log(msg) {
        if (debugLog) {
            engine.log(TAG + ' ' + msg)
        }
    }

    function cmdPrefix() {
        try {
            return String(engine.getCommandPrefix() || '!')
        } catch (e) {
            return '!'
        }
    }

    function parseMoodMap(raw) {
        const map = {}
        const text = String(raw || '').trim() || (
            'sleep|sleep,relax,calm,night,chill,ambient\n' +
            'work|work,office,productivity\n' +
            'study|study,learn,homework,reading\n' +
            'focus|focus,deep,concentration,flow'
        )
        text.split(/\r?\n/).forEach(line => {
            line = String(line || '').trim()
            if (!line || line.indexOf('|') < 0) {
                return
            }
            const parts = line.split('|')
            const cmd = String(parts[0] || '').trim().toLowerCase().replace(/^!/, '')
            const keys = String(parts.slice(1).join('|') || '')
                .split(/[,，;；]/g)
                .map(s => s.trim().toLowerCase())
                .filter(Boolean)
            if (cmd && keys.length) {
                map[cmd] = keys
            }
        })
        return map
    }

    moodMap = parseMoodMap(config.moodMap)

    function reply(client, text, ctx) {
        const msg = String(text || '')
        if (!msg) {
            return
        }
        if (replyPrivate && client && typeof client.chat === 'function') {
            try {
                client.chat(msg)
                return
            } catch (e) {
                engine.log(TAG + ' private chat failed: ' + e)
            }
        }
        // Prefer Command Library reply / channel chat (群聊), not server-wide backend.chat
        try {
            if (ctx && typeof ctx.cmdReply === 'function') {
                ctx.cmdReply(msg)
                return
            }
        } catch (e0) {
            log('cmdReply failed: ' + e0)
        }
        const ch = (ctx && ctx.channel) || lastPublicChannel
        try {
            if (ch && typeof ch.chat === 'function') {
                ch.chat(msg)
                return
            }
        } catch (e1) {
            log('channel.chat failed: ' + e1)
        }
        try {
            if (client && typeof client.getChannels === 'function') {
                const chs = client.getChannels() || []
                if (chs[0] && typeof chs[0].chat === 'function') {
                    chs[0].chat(msg)
                    return
                }
            }
        } catch (e2) {
            log('client channel chat failed: ' + e2)
        }
        try {
            backend.chat(msg)
        } catch (e3) {
            engine.log(TAG + ' backend.chat failed: ' + e3)
        }
    }

    function contextFromEv(ev, cmdReply) {
        const channel = (ev && ev.channel) || null
        if (channel) {
            lastPublicChannel = channel
        }
        return { channel: channel, cmdReply: cmdReply || null }
    }

    function getAllPlaylists() {
        try {
            if (typeof media.getPlaylists === 'function') {
                return media.getPlaylists() || []
            }
        } catch (e) {
            engine.log(TAG + ' getPlaylists failed: ' + e)
        }
        return []
    }

    function playlistName(pl) {
        try {
            return (pl && pl.name && pl.name()) || ''
        } catch (e) {
            return ''
        }
    }

    function playlistId(pl) {
        try {
            return (pl && pl.id && pl.id()) || ''
        } catch (e) {
            return ''
        }
    }

    function matchPlaylists(keywords) {
        const keys = keywords || []
        const all = getAllPlaylists()
        const hits = []
        for (let i = 0; i < all.length; i++) {
            const pl = all[i]
            const name = playlistName(pl)
            if (!name) {
                continue
            }
            const lower = name.toLowerCase()
            for (let k = 0; k < keys.length; k++) {
                if (keys[k] && lower.indexOf(keys[k]) !== -1) {
                    hits.push(pl)
                    break
                }
            }
        }
        // stable sort by name
        hits.sort((a, b) => {
            const na = playlistName(a).toLowerCase()
            const nb = playlistName(b).toLowerCase()
            if (na < nb) return -1
            if (na > nb) return 1
            return 0
        })
        return hits
    }

    function clearPending(uid) {
        const p = pending[uid]
        if (!p) {
            return
        }
        if (p.timer) {
            clearTimeout(p.timer)
        }
        delete pending[uid]
    }

    function armPending(client, list, ctx) {
        const uid = client.uid()
        clearPending(uid)
        const timer = setTimeout(() => {
            delete pending[uid]
            reply(client, '[歌单] 选择已超时，请重新发送命令。', ctx)
        }, selectTimeoutMs)
        pending[uid] = {
            list: list,
            expires: Date.now() + selectTimeoutMs,
            timer: timer,
            channel: (ctx && ctx.channel) || lastPublicChannel
        }
    }

    function isShuffleOn() {
        try {
            if (typeof media.isShuffle === 'function') {
                return !!media.isShuffle()
            }
        } catch (e) {}
        try {
            if (typeof audio.isShuffle === 'function') {
                return !!audio.isShuffle()
            }
        } catch (e2) {}
        return false
    }

    function setShuffle(on) {
        try {
            if (typeof media.setShuffle === 'function') {
                media.setShuffle(!!on)
                return true
            }
        } catch (e) {}
        try {
            if (typeof audio.setShuffle === 'function') {
                audio.setShuffle(!!on)
                return true
            }
        } catch (e2) {}
        return false
    }

    /** Track count for start-index; 0 if unknown. */
    function playlistTrackCount(pl) {
        try {
            if (typeof pl.getTracks === 'function') {
                const tracks = pl.getTracks() || []
                return tracks.length
            }
        } catch (e) {}
        return 0
    }

    /**
     * SinusBot shuffle often keeps a sticky order and playlistPlayByID(..., 0)
     * always opens the same first track. When shuffle is on: pick a random index
     * and toggle shuffle to nudge a new order.
     */
    function pickStartIndex(pl) {
        const n = playlistTrackCount(pl)
        if (!randomStartWhenShuffle || !isShuffleOn() || n <= 1) {
            return 0
        }
        const idx = Math.floor(Math.random() * n)
        log('shuffle on — random start ' + (idx + 1) + '/' + n)
        return idx
    }

    function bumpShuffleOrder() {
        if (!randomStartWhenShuffle || !isShuffleOn()) {
            return
        }
        // Off→on often re-seeds SinusBot's internal shuffle bag
        if (setShuffle(false)) {
            setShuffle(true)
            log('bumped shuffle off→on to reseed order')
        }
    }

    function activatePlaylist(client, pl, mood, ctx) {
        const name = playlistName(pl) || '(unnamed)'
        try {
            if (clearQueueOnSwitch && typeof media.clearQueue === 'function') {
                media.clearQueue()
            }
        } catch (e0) {
            log('clearQueue: ' + e0)
        }

        let ok = false
        try {
            if (typeof pl.setActive === 'function') {
                pl.setActive()
                ok = true
            }
        } catch (e1) {
            engine.log(TAG + ' setActive failed: ' + e1)
        }

        bumpShuffleOrder()
        const startIdx = pickStartIndex(pl)

        if (autoPlay) {
            try {
                if (typeof media.playlistPlayByID === 'function') {
                    media.playlistPlayByID(pl, startIdx)
                    ok = true
                } else if (typeof pl.getTracks === 'function') {
                    const tracks = pl.getTracks() || []
                    const track = tracks[startIdx] || tracks[0]
                    if (track && typeof track.play === 'function') {
                        track.play()
                        ok = true
                    } else if (track && typeof media.playURL === 'function') {
                        const url = (track.url && track.url()) ||
                            (track.filename && track.filename()) || ''
                        if (url) {
                            media.playURL(url)
                            ok = true
                        }
                    }
                }
            } catch (e2) {
                engine.log(TAG + ' autoPlay failed: ' + e2)
            }

            try {
                if (typeof audio.setMute === 'function') {
                    audio.setMute(false)
                }
            } catch (e3) {}
        }

        const moodLabel = mood ? ('（' + mood + '）') : ''
        if (ok) {
            const startHint = startIdx > 0 ? (' · 随机起点 #' + (startIdx + 1)) : ''
            reply(client, '[歌单] 已切换到：' + name + ' ' + moodLabel + startHint, ctx)
            engine.log(TAG + ' switched to "' + name + '" for ' + client.nick() +
                ' mood=' + mood + ' start=' + startIdx + ' shuffle=' + isShuffleOn())
        } else {
            reply(client, '[歌单] 切换失败：' + name + '（请检查脚本权限 / SinusBot 版本）', ctx)
        }
    }

    function handleMood(client, mood, ctx) {
        const keywords = moodMap[mood]
        if (!keywords) {
            return false
        }
        const hits = matchPlaylists(keywords)
        if (!hits.length) {
            reply(client,
                '[歌单] 没有匹配「' + mood + '」的 playlist。\n' +
                '关键词：' + keywords.join(', ') + '\n' +
                '请在 Web 里把歌单名包含这些词，或改脚本 Mood map。', ctx)
            return true
        }
        if (hits.length === 1) {
            activatePlaylist(client, hits[0], mood, ctx)
            return true
        }

        armPending(client, hits, ctx)
        const lines = ['[歌单] 「' + mood + '」匹配到 ' + hits.length + ' 个，请回复序号或完整名称：']
        for (let i = 0; i < hits.length; i++) {
            lines.push((i + 1) + ') ' + playlistName(hits[i]))
        }
        lines.push('（' + Math.round(selectTimeoutMs / 1000) + ' 秒内有效）')
        reply(client, lines.join('\n'), ctx)
        return true
    }

    function handleSelection(client, text, ctx) {
        const uid = client.uid()
        const p = pending[uid]
        if (!p) {
            return false
        }
        if (Date.now() > p.expires) {
            clearPending(uid)
            return false
        }

        const raw = String(text || '').trim()
        if (!raw) {
            return false
        }

        const selCtx = ctx || { channel: p.channel || lastPublicChannel, cmdReply: null }

        // cancel
        if (/^(cancel|取消|c)$/i.test(raw)) {
            clearPending(uid)
            reply(client, '[歌单] 已取消选择。', selCtx)
            return true
        }

        let chosen = null
        const asNum = parseInt(raw, 10)
        if (String(asNum) === raw && asNum >= 1 && asNum <= p.list.length) {
            chosen = p.list[asNum - 1]
        } else {
            const lower = raw.toLowerCase()
            for (let i = 0; i < p.list.length; i++) {
                if (playlistName(p.list[i]).toLowerCase() === lower) {
                    chosen = p.list[i]
                    break
                }
            }
            // partial unique match
            if (!chosen) {
                const partial = p.list.filter(pl => playlistName(pl).toLowerCase().indexOf(lower) !== -1)
                if (partial.length === 1) {
                    chosen = partial[0]
                }
            }
        }

        if (!chosen) {
            reply(client, '[歌单] 无效选择，请回复列表中的序号或名称（cancel 取消）。', selCtx)
            return true
        }

        clearPending(uid)
        activatePlaylist(client, chosen, '', selCtx)
        return true
    }

    function isMoodCommand(text) {
        const t = String(text || '').trim().toLowerCase()
        const p = cmdPrefix().toLowerCase()
        for (const mood in moodMap) {
            if (!Object.prototype.hasOwnProperty.call(moodMap, mood)) {
                continue
            }
            if (t === p + mood || t === '!' + mood) {
                return mood
            }
        }
        if (t === p + 'moods' || t === '!moods' || t === p + 'mood' || t === '!mood') {
            return '__moods__'
        }
        return null
    }

    function showMoods(client, ctx) {
        const lines = ['[歌单] 可用心情命令：']
        const p = cmdPrefix()
        const keys = Object.keys(moodMap)
        if (!keys.length) {
            lines.push('（未配置 Mood map）')
        }
        for (let i = 0; i < keys.length; i++) {
            const mood = keys[i]
            const hits = matchPlaylists(moodMap[mood])
            lines.push(p + mood + ' → 关键词 [' + moodMap[mood].join(', ') + '] → 匹配 ' + hits.length + ' 个')
        }
        lines.push('用法：发命令 → 若多个歌单则回复序号。')
        reply(client, lines.join('\n'), ctx)
    }

    // Selection replies are plain text (1 / name / cancel) — always via chat.
    // Mood commands must be registered with command.js, otherwise Command Library
    // replies "There is no enabled command named !focus" while our chat handler
    // still switches the playlist.
    event.on('chat', ev => {
        if (!enabled || !ev || !ev.client) {
            return
        }
        try {
            if (ev.client.isSelf && ev.client.isSelf()) {
                return
            }
        } catch (e0) {}

        const text = ev.text
        const ctx = contextFromEv(ev, null)
        if (handleSelection(ev.client, text, ctx)) {
            return
        }

        // Fallback only if Command Library is missing / registration failed
        if (commandsRegistered) {
            return
        }
        const mood = isMoodCommand(text)
        if (!mood) {
            return
        }
        if (mood === '__moods__') {
            showMoods(ev.client, ctx)
            return
        }
        handleMood(ev.client, mood, ctx)
    })

    event.on('load', () => {
        if (!enabled) {
            return
        }
        let command = null
        try {
            command = require('command')
        } catch (e) {
            command = null
        }
        if (!command || typeof command.createCommand !== 'function') {
            engine.log(TAG + ' command.js not found — enable "Command Library" or the bot will say "no enabled command" before switching.')
            return
        }

        const moods = Object.keys(moodMap)
        for (let i = 0; i < moods.length; i++) {
            const mood = moods[i]
            try {
                command.createCommand(mood)
                    .help('Switch playlist for mood: ' + mood)
                    .manual(
                        'Lists playlists whose names match keywords for "' + mood +
                        '" (' + (moodMap[mood] || []).join(', ') +
                        '). If more than one matches, reply with the number or playlist name.'
                    )
                    .exec((client, args, cmdReply, ev) => {
                        if (!enabled) {
                            return
                        }
                        handleMood(client, mood, contextFromEv(ev, cmdReply))
                    })
            } catch (e1) {
                engine.log(TAG + ' createCommand(' + mood + ') failed: ' + e1)
            }
        }

        try {
            command.createCommand('moods')
                .help('List mood playlist commands')
                .manual('Shows configured mood commands, keywords, and how many playlists currently match.')
                .exec((client, args, cmdReply, ev) => {
                    if (!enabled) {
                        return
                    }
                    showMoods(client, contextFromEv(ev, cmdReply))
                })
        } catch (e2) {
            engine.log(TAG + ' createCommand(moods) failed: ' + e2)
        }

        commandsRegistered = true
        engine.log(
            TAG + ' registered via Command Library: ' +
            moods.map(m => cmdPrefix() + m).join(', ') + ' | ' + cmdPrefix() + 'moods'
        )
    })

    engine.log(
        TAG + ' v1.0.2 loaded — channel reply by default; moods: ' +
        Object.keys(moodMap).map(m => cmdPrefix() + m).join(', ') +
        ' | ' + cmdPrefix() + 'moods (registering on load…)'
    )
})


