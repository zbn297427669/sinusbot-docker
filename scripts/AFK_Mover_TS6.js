/**
 * AFK_Mover_TS6.js
 *
 * TS6-friendly AFK mover based on irgendwr's AFK mover (Away/Mute/Deaf/Idle) v2.4.0.
 * Keep the original script disabled; enable only this one.
 *
 * Fixes vs upstream:
 * - Skip the bot itself
 * - Null-safe channel / move
 * - Polling fallback for away/mute/deaf (TS6 often misses those events)
 * - Clear logs when move_power is insufficient
 */

registerPlugin({
    name: 'AFK Mover TS6',
    version: '1.2.2',
    description: 'TS6-hardened AFK mover. Move-back only if still in AFK channel (won\'t override manual channel changes).',
    author: 'local (based on irgendwr v2.4.0)',
    vars: [
        {
            name: 'afkChannel',
            title: 'AFK Channel',
            type: 'channel'
        },
        {
            name: 'channelPasswords',
            title: 'Per-channel passwords (optional). Only channels listed here use a password when moving; unlisted / empty password = move without password.',
            type: 'array',
            vars: [
                {
                    name: 'channel',
                    title: 'Channel',
                    type: 'channel'
                },
                {
                    name: 'password',
                    title: 'Password (leave empty = no password for this channel)',
                    type: 'string'
                }
            ]
        },
        {
            name: 'debugLog',
            title: 'Debug logging',
            type: 'checkbox',
            default: false
        },
        {
            name: 'pollFallback',
            title: 'Also poll away/mute/deaf every few seconds (recommended on TS6)',
            type: 'checkbox',
            default: true
        },
        {
            name: 'moveBackOnlyIfInAfk',
            title: 'Move-back only if user is still in the AFK channel (recommended). If they already left AFK manually, do not yank them to the old channel.',
            type: 'checkbox',
            default: true
        },
        {
            name: 'awayEnabled',
            title: '[AWAY] Move users who set themselves as away',
            type: 'checkbox'
        },
        {
            name: 'awayMoveBack',
            title: 'Move users back',
            type: 'checkbox',
            indent: 3,
            conditions: [{ field: 'awayEnabled', value: true }]
        },
        {
            name: 'awaySgBlacklist',
            title: 'Ignore users with these servergroups:',
            type: 'array',
            vars: [{
                name: 'servergroup',
                title: 'Servergroup',
                type: 'number'
            }],
            indent: 3,
            conditions: [{ field: 'awayEnabled', value: true }]
        },
        {
            name: 'awayChannelIgnoreType',
            title: 'Should this only apply to certain channels?',
            type: 'select',
            options: [
                'No, check every channel.',
                'Yes, whitelist the channels below.',
                'Yes, blacklist the channels below.'
            ],
            indent: 3,
            conditions: [{ field: 'awayEnabled', value: true }]
        },
        {
            name: 'awayChannelList',
            title: 'Channels:',
            type: 'array',
            vars: [{
                name: 'channel',
                title: 'Channel',
                type: 'channel'
            }],
            indent: 3,
            conditions: [{ field: 'awayEnabled', value: true }]
        },
        {
            name: 'awayDelay',
            title: 'Delay (in seconds)',
            type: 'number',
            indent: 3,
            conditions: [{ field: 'awayEnabled', value: true }]
        },

        {
            name: 'muteEnabled',
            title: '[MUTE] Move users who mute themselves',
            type: 'checkbox'
        },
        {
            name: 'muteMoveBack',
            title: 'Move users back',
            type: 'checkbox',
            indent: 3,
            conditions: [{ field: 'muteEnabled', value: true }]
        },
        {
            name: 'muteSgBlacklist',
            title: 'Ignore users with these servergroups:',
            type: 'array',
            vars: [{
                name: 'servergroup',
                title: 'Servergroup',
                type: 'number'
            }],
            indent: 3,
            conditions: [{ field: 'muteEnabled', value: true }]
        },
        {
            name: 'muteChannelIgnoreType',
            title: 'Should this only apply to certain channels?',
            type: 'select',
            options: [
                'No, check every channel.',
                'Yes, whitelist the channels below.',
                'Yes, blacklist the channels below.'
            ],
            indent: 3,
            conditions: [{ field: 'muteEnabled', value: true }]
        },
        {
            name: 'muteChannelList',
            title: 'Channels:',
            type: 'array',
            vars: [{
                name: 'channel',
                title: 'Channel',
                type: 'channel'
            }],
            indent: 3,
            conditions: [{ field: 'muteEnabled', value: true }]
        },
        {
            name: 'muteDelay',
            title: 'Delay (in seconds)',
            type: 'number',
            indent: 3,
            conditions: [{ field: 'muteEnabled', value: true }]
        },

        {
            name: 'deafEnabled',
            title: '[DEAF] Move users who deactivate their speaker',
            type: 'checkbox'
        },
        {
            name: 'deafMoveBack',
            title: 'Move users back',
            type: 'checkbox',
            indent: 3,
            conditions: [{ field: 'deafEnabled', value: true }]
        },
        {
            name: 'deafSgBlacklist',
            title: 'Ignore users with these servergroups:',
            type: 'array',
            vars: [{
                name: 'servergroup',
                title: 'Servergroup',
                type: 'number'
            }],
            indent: 3,
            conditions: [{ field: 'deafEnabled', value: true }]
        },
        {
            name: 'deafChannelIgnoreType',
            title: 'Should this only apply to certain channels?',
            type: 'select',
            options: [
                'No, check every channel.',
                'Yes, whitelist the channels below.',
                'Yes, blacklist the channels below.'
            ],
            indent: 3,
            conditions: [{ field: 'deafEnabled', value: true }]
        },
        {
            name: 'deafChannelList',
            title: 'Channels:',
            type: 'array',
            vars: [{
                name: 'channel',
                title: 'Channel',
                type: 'channel'
            }],
            indent: 3,
            conditions: [{ field: 'deafEnabled', value: true }]
        },
        {
            name: 'deafDelay',
            title: 'Delay (in seconds)',
            type: 'number',
            indent: 3,
            conditions: [{ field: 'deafEnabled', value: true }]
        },

        {
            name: 'idleEnabled',
            title: '[IDLE] Move users who are idle for too long',
            type: 'checkbox'
        },
        {
            name: 'idleSgBlacklist',
            title: 'Ignore users with these servergroups:',
            type: 'array',
            vars: [{
                name: 'servergroup',
                title: 'Servergroup',
                type: 'number'
            }],
            indent: 3,
            conditions: [{ field: 'idleEnabled', value: true }]
        },
        {
            name: 'idleChannelIgnoreType',
            title: 'Should this only apply to certain channels?',
            type: 'select',
            options: [
                'No, check every channel.',
                'Yes, whitelist the channels below.',
                'Yes, blacklist the channels below.'
            ],
            indent: 3,
            conditions: [{ field: 'idleEnabled', value: true }]
        },
        {
            name: 'idleChannelList',
            title: 'Channels:',
            type: 'array',
            vars: [{
                name: 'channel',
                title: 'Channel',
                type: 'channel'
            }],
            indent: 3,
            conditions: [{ field: 'idleEnabled', value: true }]
        },
        {
            name: 'idleThreshold',
            title: 'How long are people allowed to be idle? (in minutes, don\'t use small values!)',
            type: 'number',
            indent: 3,
            conditions: [{ field: 'idleEnabled', value: true }]
        },

        {
            name: 'notifyEnabled',
            title: 'Notify users when they get moved to AFK',
            type: 'checkbox'
        },
        {
            name: 'notifyType',
            title: 'How should users be notified?',
            type: 'select',
            options: ['chat', 'poke'],
            indent: 3,
            conditions: [{ field: 'notifyEnabled', value: true }]
        },
        {
            name: 'notifyText',
            title: 'Notification message (%reason% = away/mute/deaf/idle)',
            type: 'string',
            placeholder: 'You were moved to the afk channel, reason: %reason%',
            indent: 3,
            conditions: [{ field: 'notifyEnabled', value: true }]
        },
        {
            name: 'notifyMoveFail',
            title: 'Privately notify user when a move fails (password / permission)',
            type: 'checkbox',
            default: true
        },
        {
            name: 'notifyMoveFailPasswordText',
            title: 'Move-fail message when channel password is wrong/missing (%channel% = target name)',
            type: 'string',
            placeholder: '[AFK] 无法将你移回「%channel%」：频道密码不正确或未配置。请联系管理员，或手动进入该频道。',
            indent: 1,
            conditions: [{ field: 'notifyMoveFail', value: true }]
        },
        {
            name: 'notifyMoveFailGenericText',
            title: 'Move-fail message for other errors (%channel% = target name)',
            type: 'string',
            placeholder: '[AFK] 无法将你移动到「%channel%」。可能是权限不足，请联系管理员或手动切换频道。',
            indent: 1,
            conditions: [{ field: 'notifyMoveFail', value: true }]
        }
    ]
}, function (sinusbot, config, info) {
    var event = require('event')
    var engine = require('engine')
    var backend = require('backend')

    config.awayMoveBack = config.awayMoveBack || false
    config.awayDelay = config.awayDelay || 0
    config.muteMoveBack = config.muteMoveBack || false
    config.muteDelay = config.muteDelay || 0
    config.deafMoveBack = config.deafMoveBack || false
    config.deafDelay = config.deafDelay || 0
    config.idleThreshold = config.idleThreshold || 0
    config.notifyEnabled = config.notifyEnabled || false
    config.notifyType = config.notifyType || 0
    config.notifyText = config.notifyText && config.notifyText != '' ? config.notifyText : 'You were moved to the afk channel, reason: %reason%'
    if (config.notifyMoveFail == null) {
        config.notifyMoveFail = true
    }
    config.notifyMoveFailPasswordText = config.notifyMoveFailPasswordText && config.notifyMoveFailPasswordText != ''
        ? config.notifyMoveFailPasswordText
        : '[AFK] 无法将你移回「%channel%」：频道密码不正确或未配置。请联系管理员，或手动进入该频道。'
    config.notifyMoveFailGenericText = config.notifyMoveFailGenericText && config.notifyMoveFailGenericText != ''
        ? config.notifyMoveFailGenericText
        : '[AFK] 无法将你移动到「%channel%」。可能是权限不足，请联系管理员或手动切换频道。'
    if (config.pollFallback == null) {
        config.pollFallback = true
    }
    if (config.moveBackOnlyIfInAfk == null) {
        config.moveBackOnlyIfInAfk = true
    }
    engine.saveConfig(config)

    var log = new Logger()
    log.debug = config.debugLog === true
    var idleThreshold = config.idleThreshold * 60 * 1000
    var afkChannel = null
    var afk = []
    var queue = []
    var lastMoveEvent = {}
    var TAG = '[AFK Mover TS6]'

    function resolveAfkChannel() {
        if (!config.afkChannel) {
            return null
        }
        try {
            return backend.getChannelByID(config.afkChannel) || null
        } catch (e) {
            return null
        }
    }

    function ensureAfkChannel() {
        afkChannel = resolveAfkChannel()
        return afkChannel
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
        try {
            var bot = backend.getBotClient()
            if (bot && client.id() === bot.id()) {
                return true
            }
        } catch (e2) {}
        return false
    }

    function getClientChannel(client) {
        try {
            var channels = client.getChannels()
            if (channels && channels.length > 0 && channels[0]) {
                return channels[0]
            }
        } catch (e) {}
        return null
    }

    function isInAfkChannel(client) {
        var ch = getClientChannel(client)
        var afkCh = ensureAfkChannel()
        if (!ch || !afkCh) {
            return false
        }
        try {
            return afkCh.equals(ch)
        } catch (e) {
            try {
                return String(afkCh.id()) === String(ch.id())
            } catch (e2) {
                return false
            }
        }
    }

    function channelLabel(channel) {
        if (!channel) {
            return '(none)'
        }
        var id = '?'
        var name = '?'
        try { id = String(channel.id()) } catch (e0) {}
        try { name = String(channel.name()) } catch (e1) {}
        return name + ' [cid=' + id + ']'
    }

    function channelNeedsPassword(channel) {
        try {
            if (channel && typeof channel.isPassworded === 'function') {
                return !!channel.isPassworded()
            }
        } catch (e) {}
        return false
    }

    /**
     * Resolve password for a target channel from per-channel config.
     * - Not listed → '' (move without password)
     * - Listed but empty password → '' (move without password)
     * - Listed with non-empty password → that password
     */
    function passwordForChannel(channel) {
        if (!channel) {
            return ''
        }
        var id = ''
        try {
            id = String(channel.id())
        } catch (e0) {
            return ''
        }
        var list = config.channelPasswords || []
        for (var i = 0; i < list.length; i++) {
            var item = list[i]
            if (!item || item.channel == null || item.channel === '') {
                continue
            }
            if (String(item.channel) === id) {
                return String(item.password || '').trim()
            }
        }
        // Legacy single-password field (v1.1.1) as last-resort fallback
        if (config.moveChannelPassword) {
            return String(config.moveChannelPassword).trim()
        }
        return ''
    }

    function channelDisplayName(channel) {
        try {
            return (channel && channel.name && channel.name()) || '目标频道'
        } catch (e) {
            return '目标频道'
        }
    }

    function notifyClient(client, text) {
        if (!client || !text) {
            return
        }
        try {
            // Failures always use private chat (小窗), clearer than poke for long text
            client.chat(String(text))
        } catch (e) {
            log.w(TAG + ' notifyClient failed: ' + e)
        }
    }

    function notifyMoveFailure(client, channel, kind, why) {
        if (config.notifyMoveFail === false || !client) {
            return
        }
        var chName = channelDisplayName(channel)
        var tpl
        if (kind === 'password') {
            tpl = config.notifyMoveFailPasswordText
        } else {
            tpl = config.notifyMoveFailGenericText
        }
        var msg = String(tpl || '').replace(/%channel%/gi, chName)
        if (why && String(why).indexOf('moveBack') === 0) {
            // keep wording; template already says 移回 for password default
        }
        notifyClient(client, msg)
        log.i(TAG + ' told ' + client.nick() + ' about move failure (' + kind + ') → ' + chName)
    }

    function classifyMoveFail(channel, pass, errText) {
        var err = String(errText || '')
        if (/password/i.test(err)) {
            return 'password'
        }
        if (channelNeedsPassword(channel) && !pass) {
            return 'password'
        }
        if (channelNeedsPassword(channel) && pass) {
            return 'password'
        }
        return 'generic'
    }

    function safeMove(client, channel, why, onDone) {
        if (!client || !channel) {
            log.w(TAG + ' move skipped (' + why + '): missing client/channel')
            if (onDone) {
                onDone(false)
            }
            return false
        }

        var configuredPass = passwordForChannel(channel)
        // Only send a password when the channel is actually password-protected.
        // If you configured a password for an open channel, it is ignored (no problem).
        var pass = (configuredPass && channelNeedsPassword(channel)) ? configuredPass : ''
        var tryPass = !!pass

        try {
            if (tryPass) {
                log.d(TAG + ' move with password → ' + channelLabel(channel) + ' (' + why + ')')
                client.moveTo(channel, pass)
            } else {
                if (configuredPass && !channelNeedsPassword(channel)) {
                    log.d(TAG + ' channel has no password — ignoring configured password for ' +
                        channelLabel(channel))
                }
                client.moveTo(channel)
            }
        } catch (e) {
            var err = String(e || '')
            log.e(TAG + ' move FAILED for ' + client.nick() + ' → ' + channelLabel(channel) +
                ' (' + why + '): ' + e)
            if (/password/i.test(err)) {
                log.e(TAG + ' hint: add this channel under "Per-channel passwords" with the correct password ' +
                    '(or leave unlisted only if the channel has no password).')
            } else {
                log.e(TAG + ' hint: also check i_client_move_power > user needed_move_power (Server Admin often 75).')
            }
            notifyMoveFailure(client, channel, classifyMoveFail(channel, pass, err), why)
            if (onDone) {
                onDone(false)
            }
            return false
        }

        // moveTo often does not throw on permission denial — verify after a tick
        setTimeout(function () {
            var ok = false
            try {
                var cur = getClientChannel(client)
                ok = !!(cur && String(cur.id()) === String(channel.id()))
            } catch (e2) {}

            if (ok) {
                log.i(TAG + ' moved ' + client.nick() + ' → ' + channelLabel(channel) + ' (' + why + ')')
            } else {
                log.e(TAG + ' move NOT applied for ' + client.nick() + ' → ' + channelLabel(channel) +
                    ' (' + why + ') — still not in target.')
                var kind = 'generic'
                if (channelNeedsPassword(channel) && !pass) {
                    kind = 'password'
                    log.e(TAG + ' target is password-protected but no password configured for this cid in "Per-channel passwords".')
                } else if (channelNeedsPassword(channel) && pass) {
                    kind = 'password'
                    log.e(TAG + ' password was sent but move still failed — wrong password, or move_power too low.')
                } else {
                    log.e(TAG + ' hint: check bot i_client_move_power > user needed_move_power; or channel password / join power.')
                }
                // SinusBot often logs "invalid channel password" without throwing — treat passworded targets as password fail
                notifyMoveFailure(client, channel, kind, why)
            }
            if (onDone) {
                onDone(ok)
            }
        }, 400)
        return true
    }

    if (!config.afkChannel) {
        engine.notify('AFK Mover TS6: specify an AFK channel.')
        log.e(TAG + ' AFK channel not set')
        return
    }

    ensureAfkChannel()
    if (!afkChannel) {
        log.w(TAG + ' Unable to find AFK channel id=' + config.afkChannel + ' (will retry on connect)')
    }

    if (!(config.awayEnabled || config.muteEnabled || config.deafEnabled || config.idleEnabled)) {
        log.w(TAG + ' No mode enabled (away/mute/deaf/idle)')
    }

    event.on('connect', function () {
        if (ensureAfkChannel()) {
            log.i(TAG + ' AFK channel OK: ' + afkChannel.name() + ' (' + afkChannel.id() + ')')
        } else {
            log.w(TAG + ' AFK channel not found on connect')
        }
    })

    event.on('load', function () {
        if (ensureAfkChannel()) {
            log.i(TAG + ' AFK channel OK on load: ' + afkChannel.name())
        } else {
            log.w(TAG + ' AFK channel not found on load')
        }
    })

    log.i(TAG + ' v' + info.version + ' loaded (debug=' + log.debug +
        ', pollFallback=' + !!config.pollFallback +
        ', moveBackOnlyIfInAfk=' + (config.moveBackOnlyIfInAfk !== false) + ')')

    var events = [
        { name: 'away', afk: 'clientAway', back: 'clientBack' },
        { name: 'mute', afk: 'clientMute', back: 'clientUnmute' },
        { name: 'deaf', afk: 'clientDeaf', back: 'clientUndeaf' }
    ]

    events.forEach(function (ev) {
        if (!config[ev.name + 'Enabled']) {
            return
        }

        event.on(ev.afk, function (client) {
            if (isBotClient(client)) {
                return
            }
            log.d(ev.afk + ': ' + client.nick())
            if (groupIsIncluded(client, config[ev.name + 'SgBlacklist']) &&
                channelIsIncluded(client, config[ev.name + 'ChannelIgnoreType'], config[ev.name + 'ChannelList'])) {
                if (config[ev.name + 'Delay']) {
                    addQueue(client, ev.name)
                } else {
                    setAFK(client, ev.name)
                }
            }
        })

        event.on(ev.back, function (client) {
            if (isBotClient(client)) {
                return
            }
            removeAFK(client, ev.name)
        })
    })

    function addQueue(client, eventName) {
        queue.push({
            event: eventName,
            uid: client.uid(),
            timestamp: timestamp()
        })
    }

    function removeQueue(index) {
        queue.splice(index, 1)
    }

    function checkQueue() {
        for (var i = queue.length - 1; i >= 0; i--) {
            var queued = queue[i]
            var eventName = queued.event
            var client = backend.getClientByUID(queued.uid)

            if (!client || isBotClient(client)) {
                removeQueue(i)
                continue
            }

            var stillAFK = false
            switch (eventName) {
                case 'away': stillAFK = client.isAway(); break
                case 'mute': stillAFK = client.isMuted(); break
                case 'deaf': stillAFK = client.isDeaf(); break
            }

            if (stillAFK) {
                if (timestamp() - queued.timestamp >= config[eventName + 'Delay'] * 1000) {
                    setAFK(client, eventName)
                    removeQueue(i)
                }
            } else {
                removeQueue(i)
            }
        }
    }

    setInterval(checkQueue, 2 * 1000)

    function pollAwayMuteDeaf() {
        if (!config.pollFallback || !ensureAfkChannel()) {
            return
        }

        var clients = []
        try {
            clients = backend.getClients() || []
        } catch (e) {
            return
        }

        clients.forEach(function (client) {
            if (isBotClient(client)) {
                return
            }

            if (isInAfkChannel(client)) {
                if (config.awayEnabled && config.awayMoveBack && afk[client.uid()] && afk[client.uid()].away && !client.isAway()) {
                    removeAFK(client, 'away')
                }
                if (config.muteEnabled && config.muteMoveBack && afk[client.uid()] && afk[client.uid()].mute && !client.isMuted()) {
                    removeAFK(client, 'mute')
                }
                if (config.deafEnabled && config.deafMoveBack && afk[client.uid()] && afk[client.uid()].deaf && !client.isDeaf()) {
                    removeAFK(client, 'deaf')
                }
                return
            }

            function maybeQueueOrSet(name, isAfkNow) {
                if (!config[name + 'Enabled'] || !isAfkNow) {
                    return
                }
                if (!(groupIsIncluded(client, config[name + 'SgBlacklist']) &&
                    channelIsIncluded(client, config[name + 'ChannelIgnoreType'], config[name + 'ChannelList']))) {
                    return
                }
                if (afk[client.uid()] && afk[client.uid()][name]) {
                    return
                }
                var alreadyQueued = queue.some(function (q) {
                    return q.uid === client.uid() && q.event === name
                })
                if (alreadyQueued) {
                    return
                }
                if (config[name + 'Delay']) {
                    addQueue(client, name)
                } else {
                    setAFK(client, name)
                }
            }

            try {
                maybeQueueOrSet('away', client.isAway())
                maybeQueueOrSet('mute', client.isMuted())
                maybeQueueOrSet('deaf', client.isDeaf())
            } catch (e2) {}
        })
    }

    if ((config.awayEnabled || config.muteEnabled || config.deafEnabled) && config.pollFallback) {
        log.i(TAG + ' poll fallback every 5s')
        setInterval(pollAwayMuteDeaf, 5 * 1000)
        setTimeout(pollAwayMuteDeaf, 2000)
    }

    if (config.idleEnabled) {
        if (!config.idleThreshold || config.idleThreshold <= 0) {
            log.w(TAG + ' idleThreshold is 0 — will move almost immediately')
        }
        setInterval(checkIdle, 10 * 1000)
        checkIdle()

        event.on('clientMove', function (ev) {
            if (ev.toChannel) {
                lastMoveEvent[ev.client.uid()] = timestamp()
            } else {
                delete lastMoveEvent[ev.client.uid()]
                delete afk[ev.client.uid()]
            }
        })
    } else {
        event.on('clientMove', function (ev) {
            if (!ev.toChannel) {
                delete afk[ev.client.uid()]
            }
        })
    }

    function checkIdle() {
        if (!ensureAfkChannel()) {
            return
        }
        var clients = []
        try {
            clients = backend.getClients() || []
        } catch (e) {
            return
        }

        clients.forEach(function (client) {
            if (isBotClient(client) || isInAfkChannel(client)) {
                return
            }
            var idleTime = 0
            try {
                idleTime = client.getIdleTime() || 0
            } catch (e2) {
                return
            }
            if (idleTime > idleThreshold && (lastMoveEvent[client.uid()] || 0) < timestamp() - idleThreshold) {
                if (groupIsIncluded(client, config.idleSgBlacklist) &&
                    channelIsIncluded(client, config.idleChannelIgnoreType, config.idleChannelList)) {
                    setAFK(client, 'idle')
                }
            }
        })
    }

    function removeAFK(client, eventName) {
        var afkClient = afk[client.uid()] ? afk[client.uid()][eventName] : null
        if (!afkClient) {
            return
        }

        afk[client.uid()][eventName] = null

        if (!config[eventName + 'MoveBack']) {
            return
        }

        // User already left the AFK channel on their own — respect that destination.
        var onlyIfInAfk = config.moveBackOnlyIfInAfk !== false
        if (onlyIfInAfk && !isInAfkChannel(client)) {
            var curName = '-'
            try {
                var cur = getClientChannel(client)
                curName = cur ? cur.name() : 'none'
            } catch (e0) {}
            log.i(TAG + ' skip moveBack for ' + client.nick() +
                ' — already left AFK (now in: ' + curName + ', remembered was id=' + afkClient.prevChannel + ')')
            return
        }

        var prevChannel = null
        try {
            prevChannel = backend.getChannelByID(afkClient.prevChannel)
        } catch (e) {}
        if (!prevChannel) {
            log.w(TAG + ' previous channel gone, cannot move back ' + client.nick() +
                ' (remembered cid=' + afkClient.prevChannel +
                (afkClient.prevChannelName ? ', name=' + afkClient.prevChannelName : '') + ')')
            return
        }
        log.i(TAG + ' moveBack ' + client.nick() + ' to remembered ' + channelLabel(prevChannel) +
            ' (' + eventName + ')')
        safeMove(client, prevChannel, 'moveBack:' + eventName, null)
    }

    function setAFK(client, eventName) {
        if (isBotClient(client)) {
            return
        }
        if (!ensureAfkChannel()) {
            log.w(TAG + ' cannot move — AFK channel not found')
            return
        }
        if (isInAfkChannel(client)) {
            return
        }

        var cur = getClientChannel(client)
        if (!cur) {
            log.w(TAG + ' ' + client.nick() + ' has no visible channel — skip')
            return
        }

        if (!afk[client.uid()]) {
            afk[client.uid()] = {}
        }
        var prevName = '?'
        try { prevName = cur.name() } catch (eN) {}
        afk[client.uid()][eventName] = {
            prevChannel: cur.id(),
            prevChannelName: prevName,
            timestamp: timestamp()
        }
        log.i(TAG + ' remember ' + client.nick() + ' was in ' + channelLabel(cur) +
            ' before AFK (' + eventName + ')')

        safeMove(client, afkChannel, eventName, function (ok) {
            if (!ok) {
                delete afk[client.uid()][eventName]
                return
            }
            if (!config.notifyEnabled) {
                return
            }
            var msg = config.notifyText.replace(/%reason%/gi, eventName)
            try {
                switch (config.notifyType) {
                    case '0':
                    case 0: client.chat(msg); break
                    case '1':
                    case 1: client.poke(msg); break
                }
            } catch (e) {
                log.w(TAG + ' notify failed: ' + e)
            }
        })
    }

    function groupIsIncluded(client, blacklist) {
        if (!blacklist) {
            return true
        }
        return !client.getServerGroups().some(function (servergroup) {
            return blacklist.some(function (blacklistItem) {
                return servergroup.id() == blacklistItem.servergroup
            })
        })
    }

    function channelIsIncluded(client, listType, channelList) {
        if (!listType) {
            return true
        }
        if (!channelList) {
            return listType != 1
        }
        var channels = []
        try {
            channels = client.getChannels() || []
        } catch (e) {
            return false
        }
        return (listType == 1) == channels.some(function (channel) {
            return channelList.some(function (item) {
                return channel.id() == item.channel
            })
        })
    }

    function timestamp() {
        return Date.now()
    }

    function Logger() {
        this.debug = false
        this.log = function (level, msg) {
            if (typeof msg == 'object') {
                msg = JSON.stringify(msg)
            }
            engine.log('[' + level + '] ' + msg)
        }
        this.e = function (msg) { this.log('ERROR', msg) }
        this.w = function (msg) { this.log('WARN', msg) }
        this.i = function (msg) { this.log('INFO', msg) }
        this.d = function (msg) {
            if (this.debug) {
                this.log('DEBUG', msg)
            }
        }
    }
})
