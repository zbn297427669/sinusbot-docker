/**
 * WelcomeMessageTS6.js
 *
 * Local TS6-friendly welcome message (plain text, no BBCode).
 * Disable the official "WelcomeMessge+" script — use only this one.
 *
 * With teamspeak-community-bot handling welcome:
 *   - Set "Enable join welcome" = OFF here, OR disable this whole script
 *   - Use WmHelpersTS6.js (!si …) for full group/channel lists (SinusBot engine)
 *   - Use community-bot !wm ignore|status|… for personal welcome opt-out
 *
 * Commands (if "Enable !wm commands" is ON — may duplicate community-bot):
 *   !wm ignore / unignore / groups / allgroups / channels / me / online / who
 */

registerPlugin({
    name: 'Welcome Message TS6',
    version: '1.0.9',
    engine: '>= 0.9.21',
    backends: ['ts3'],
    description: 'TS6 plain-text welcome on join. Can disable welcome while keeping or dropping !wm.',
    author: 'local',
    vars: [
        {
            name: 'enableWelcome',
            title: 'Enable join welcome (OFF = no greeting; use community-bot welcome instead)',
            type: 'checkbox',
            default: true
        },
        {
            name: 'enableWmCommands',
            title: 'Enable !wm commands on this script (OFF if community-bot + WmHelpersTS6 handle commands)',
            type: 'checkbox',
            default: true
        },
        {
            name: 'prefix',
            title: 'Prefix (plain text)',
            type: 'string',
            placeholder: '[欢迎]'
        },
        {
            name: 'msg',
            title: 'Message (%prefix% %username% %userOnlineCount% %teamOnlineCount% %totalConnections%)',
            type: 'multiline',
            placeholder:
                '%prefix% 欢迎 %username%！\n' +
                '%prefix% 这是你第 %totalConnections% 次来到本服务器。\n' +
                '%prefix% 当前在线：%userOnlineCount% 人（管理组 %teamOnlineCount% 人）。\n' +
                '%prefix% 音乐房可以听歌；需要帮助请联系管理。\n' +
                '%prefix% 不想再收到：!wm ignore　重新开启：!wm unignore'
        },
        {
            name: 'ignoreGroups',
            title: 'Ignore server group IDs (bots/staff: no welcome; also excluded from %userOnlineCount%) — put MusicBot group here',
            type: 'strings'
        },
        {
            name: 'teamGroups',
            title: 'Team server group IDs (counted in %teamOnlineCount%)',
            type: 'strings'
        },
        {
            name: 'ignoreClients',
            title: 'Ignored client UIDs — no welcome AND excluded from %userOnlineCount% (!wm ignore adds here; put other bot UIDs here too)',
            type: 'strings'
        },
        {
            name: 'excludeBotFromCount',
            title: 'Exclude this SinusBot instance from %userOnlineCount%',
            type: 'checkbox',
            default: true
        },
        {
            name: 'excludeCountUids',
            title: 'Extra UIDs excluded only from count (optional; same effect as ignoreClients for counting)',
            type: 'strings'
        },
        {
            name: 'excludeNickContains',
            title: 'Also exclude nicks containing these (case-insensitive; e.g. LÚCIO / MusicBot)',
            type: 'strings'
        },
        {
            name: 'debugLog',
            title: 'Debug: log who was counted / skipped',
            type: 'checkbox',
            default: false
        }
    ]
}, function (_sinusbot, config) {
    var engine = require('engine')
    var backend = require('backend')
    var event = require('event')

    var TAG = '[Welcome TS6]'
    var ignoreGroups = config.ignoreGroups || []
    var teamGroups = config.teamGroups || []
    if (!config.ignoreClients) {
        config.ignoreClients = []
        try {
            engine.saveConfig(config)
        } catch (e0) {}
    }

    var prefix = (config.prefix && String(config.prefix).trim()) ? String(config.prefix).trim() : '[欢迎]'
    // Never keep BBCode in prefix on TS6
    if (/\[COLOR=/i.test(prefix) || /\[\/COLOR\]/i.test(prefix) || /\[b\]/i.test(prefix)) {
        prefix = '[欢迎]'
    }

    var msgTpl = (config.msg && String(config.msg).trim())
        ? String(config.msg)
        : (
            '%prefix% 欢迎 %username%！\n' +
            '%prefix% 这是你第 %totalConnections% 次来到本服务器。\n' +
            '%prefix% 当前在线：%userOnlineCount% 人（管理组 %teamOnlineCount% 人）。\n' +
            '%prefix% 音乐房可以听歌；需要帮助请联系管理。\n' +
            '%prefix% 不想再收到：!wm ignore　重新开启：!wm unignore'
        )

    msgTpl = stripBbcode(msgTpl)
    prefix = stripBbcode(prefix)

    function stripBbcode(s) {
        return String(s || '')
            .replace(/\[\/?COLOR(?:=[^\]]+)?\]/gi, '')
            .replace(/\[\/?B\]/gi, '')
            .replace(/\[\/?I\]/gi, '')
            .replace(/\[\/?U\]/gi, '')
    }

    function groupIdList(list) {
        if (!list || !list.length) {
            return []
        }
        return list.map(function (x) {
            return String(x)
        }).filter(function (x) {
            return x && x !== 'undefined'
        })
    }

    function isInGroup(client, groups) {
        var ids = groupIdList(groups)
        if (!ids.length || !client) {
            return false
        }
        var hit = false
        try {
            (client.getServerGroups() || []).forEach(function (g) {
                if (ids.indexOf(String(g.id())) !== -1) {
                    hit = true
                }
            })
        } catch (e) {}
        return hit
    }

    function clientUid(client) {
        try {
            if (client && typeof client.uid === 'function') {
                var u = client.uid()
                if (u) {
                    return String(u).trim()
                }
            }
        } catch (e0) {}
        // some builds expose uniqueId()
        try {
            if (client && typeof client.uniqueId === 'function') {
                var u2 = client.uniqueId()
                if (u2) {
                    return String(u2).trim()
                }
            }
        } catch (e1) {}
        return ''
    }

    function normalizeUidList(list) {
        return groupIdList(list).map(function (x) {
            return String(x).trim()
        }).filter(Boolean)
    }

    function uidInList(client, list) {
        var uid = clientUid(client)
        if (!uid) {
            return false
        }
        var ids = normalizeUidList(list)
        if (!ids.length) {
            return false
        }
        if (ids.indexOf(uid) !== -1) {
            return true
        }
        // tolerate accidental whitespace / case issues on base64-ish UIDs
        var lower = uid.toLowerCase()
        for (var i = 0; i < ids.length; i++) {
            if (ids[i].toLowerCase() === lower) {
                return true
            }
        }
        return false
    }

    function clientName(client) {
        try {
            return (client && client.name && client.name()) || ''
        } catch (e) {
            return ''
        }
    }

    function clientId(client) {
        try {
            return (client && client.id && String(client.id())) || ''
        } catch (e) {
            return ''
        }
    }

    /** This instance's bot (+ TS6-safe fallbacks). */
    function isSelfBot(client) {
        if (!client) {
            return true
        }
        try {
            if (typeof client.isSelf === 'function' && client.isSelf()) {
                return true
            }
        } catch (e0) {}
        try {
            var bot = backend.getBotClient && backend.getBotClient()
            if (bot) {
                if (clientId(client) && clientId(client) === clientId(bot)) {
                    return true
                }
                if (clientUid(client) && clientUid(client) === clientUid(bot)) {
                    return true
                }
            }
        } catch (e1) {}
        try {
            var bid = backend.getBotClientID && backend.getBotClientID()
            if (bid) {
                var uid = clientUid(client)
                var id = clientId(client)
                // exact match only — do NOT use indexOf (false positives / empty edge cases)
                if (uid && uid === String(bid).trim()) {
                    return true
                }
                if (id && id === String(bid).trim()) {
                    return true
                }
            }
        } catch (e2) {}
        return false
    }

    function nickExcluded(client) {
        var pats = groupIdList(config.excludeNickContains || [])
        if (!pats.length) {
            return false
        }
        var name = clientName(client).toLowerCase()
        if (!name) {
            return false
        }
        for (var i = 0; i < pats.length; i++) {
            var p = String(pats[i] || '').toLowerCase()
            if (p && name.indexOf(p) !== -1) {
                return true
            }
        }
        return false
    }

    function shouldSkipFromUserCount(client) {
        if (config.excludeBotFromCount !== false && isSelfBot(client)) {
            return 'self-bot'
        }
        if (isInGroup(client, ignoreGroups)) {
            return 'ignore-group'
        }
        // v1.0.0 bug: ignoreClients only skipped welcome text, NOT the online count
        if (uidInList(client, config.ignoreClients)) {
            return 'ignore-clients-uid'
        }
        if (uidInList(client, config.excludeCountUids)) {
            return 'exclude-count-uid'
        }
        if (nickExcluded(client)) {
            return 'exclude-nick'
        }
        return ''
    }

    function totalConnections(client) {
        try {
            if (typeof client.getTotalConnections === 'function') {
                var n = client.getTotalConnections()
                // TS6 often returns 0 / invalid even for returning users — never show "第 0 次"
                if (typeof n === 'number' && !isNaN(n) && n >= 1) {
                    return n
                }
            }
        } catch (e) {}
        return '?'
    }

    function playersOnline() {
        var clients = []
        try {
            clients = backend.getClients() || []
        } catch (e) {
            return 0
        }
        var n = 0
        var debug = config.debugLog === true
        for (var i = 0; i < clients.length; i++) {
            var c = clients[i]
            var reason = shouldSkipFromUserCount(c)
            if (reason) {
                if (debug) {
                    engine.log(TAG + ' count skip "' + clientName(c) + '" (' + reason + ')')
                }
                continue
            }
            n++
            if (debug) {
                engine.log(TAG + ' count keep "' + clientName(c) + '" uid=' + clientUid(c))
            }
        }
        if (debug) {
            engine.log(TAG + ' userOnlineCount=' + n + ' / raw=' + clients.length)
        }
        return n
    }

    function teamOnline() {
        var clients = []
        try {
            clients = backend.getClients() || []
        } catch (e) {
            return 0
        }
        var n = 0
        for (var i = 0; i < clients.length; i++) {
            if (isInGroup(clients[i], teamGroups)) {
                n++
            }
        }
        return n
    }

    function buildMessage(client) {
        var text = msgTpl
        text = text.replace(/%username%/g, client.name() || 'user')
        text = text.replace(/%userOnlineCount%/g, String(playersOnline()))
        text = text.replace(/%totalConnections%/g, String(totalConnections(client)))
        text = text.replace(/%teamOnlineCount%/g, String(teamOnline()))
        text = text.replace(/%prefix%/g, prefix)
        return text
    }

    /** uid -> last welcome timestamp (ms) — avoid spam on TS6 reconnect flaps */
    var recentWelcome = {}
    var WELCOME_DEBOUNCE_MS = 60 * 1000

    event.on('clientMove', function (ev) {
        if (config.enableWelcome === false) {
            return
        }
        setTimeout(function () {
            try {
                if (!ev || !ev.client) {
                    return
                }
                // Join server: fromChannel undefined
                if (typeof ev.fromChannel !== 'undefined') {
                    return
                }
                if (isSelfBot(ev.client)) {
                    return
                }
                if (isInGroup(ev.client, ignoreGroups)) {
                    return
                }
                if (uidInList(ev.client, config.ignoreClients)) {
                    return
                }
                var uid = ''
                try {
                    uid = ev.client.uid() || ''
                } catch (eUid) {}
                var now = Date.now()
                if (uid && recentWelcome[uid] && (now - recentWelcome[uid]) < WELCOME_DEBOUNCE_MS) {
                    engine.log(TAG + ' skip welcome (debounce) for ' + clientName(ev.client))
                    return
                }
                if (uid) {
                    recentWelcome[uid] = now
                }
                engine.log(TAG + ' welcome → ' + clientName(ev.client) +
                    ' connections=' + totalConnections(ev.client))
                ev.client.chat('\n' + buildMessage(ev.client))
            } catch (e) {
                engine.log(TAG + ' send failed: ' + e)
            }
        }, 1000)
    })

    function formatGroupLine(g) {
        var id = '?'
        var name = '?'
        try {
            id = String(g.id())
        } catch (e0) {}
        try {
            name = String(g.name())
        } catch (e1) {}
        return 'ID ' + id + ' — ' + name
    }

    function replyMyGroups(client) {
        var lines = [prefix + ' 你当前的服务器组：']
        try {
            var groups = client.getServerGroups() || []
            if (!groups.length) {
                lines.push('（无 / 读取失败）')
            } else {
                for (var i = 0; i < groups.length; i++) {
                    lines.push(formatGroupLine(groups[i]))
                }
            }
        } catch (e) {
            lines.push('读取失败：' + e)
        }
        lines.push('把管理员组的 ID 填进脚本 Team server group IDs。')
        client.chat(lines.join('\n'))
    }

    function replyAllGroups(client) {
        var lines = [prefix + ' 本服全部服务器组：']
        try {
            var groups = []
            if (typeof backend.getServerGroups === 'function') {
                groups = backend.getServerGroups() || []
            }
            if (!groups.length) {
                lines.push('（列表为空 / API 不可用）')
            } else {
                for (var i = 0; i < groups.length; i++) {
                    lines.push(formatGroupLine(groups[i]))
                }
            }
        } catch (e) {
            lines.push('读取失败：' + e)
        }
        client.chat(lines.join('\n'))
    }

    function formatChannelLine(ch) {
        var id = '?'
        var name = '?'
        try {
            id = String(ch.id())
        } catch (e0) {}
        try {
            name = String(ch.name())
        } catch (e1) {}
        return 'cid ' + id + ' — ' + name
    }

    /** Split long private chats so TS does not drop the message. */
    function chatChunks(client, lines) {
        var maxChars = 850
        var buf = []
        var len = 0
        function flush() {
            if (!buf.length) {
                return
            }
            try {
                client.chat(buf.join('\n'))
            } catch (e) {
                engine.log(TAG + ' chatChunks failed: ' + e)
            }
            buf = []
            len = 0
        }
        for (var i = 0; i < lines.length; i++) {
            var line = String(lines[i] || '')
            var add = line.length + (buf.length ? 1 : 0)
            if (buf.length && len + add > maxChars) {
                flush()
            }
            buf.push(line)
            len += add
        }
        flush()
    }

    function replyAllChannels(client) {
        var lines = [prefix + ' 本服全部频道（cid）：']
        try {
            var channels = []
            if (typeof backend.getChannels === 'function') {
                channels = backend.getChannels() || []
            }
            if (!channels.length) {
                lines.push('（列表为空 / API 不可用）')
            } else {
                // stable sort by id when possible
                channels = channels.slice().sort(function (a, b) {
                    var ia = 0
                    var ib = 0
                    try { ia = parseInt(a.id(), 10) || 0 } catch (e0) {}
                    try { ib = parseInt(b.id(), 10) || 0 } catch (e1) {}
                    return ia - ib
                })
                for (var i = 0; i < channels.length; i++) {
                    lines.push(formatChannelLine(channels[i]))
                }
            }
        } catch (e) {
            lines.push('读取失败：' + e)
        }
        lines.push('把目标频道的 cid 填进 bot / 脚本的默认频道等配置。')
        chatChunks(client, lines)
    }

    function doIgnore(client) {
        if ((config.ignoreClients || []).indexOf(client.uid()) < 0) {
            config.ignoreClients.push(client.uid())
            engine.saveConfig(config)
        }
        client.chat(prefix + ' 已关闭欢迎语。重新开启请发送 !wm unignore')
    }

    function doUnignore(client) {
        var idx = (config.ignoreClients || []).indexOf(client.uid())
        if (idx >= 0) {
            config.ignoreClients.splice(idx, 1)
            engine.saveConfig(config)
        }
        client.chat(prefix + ' 已重新开启欢迎语。')
    }

    function clientNick(c) {
        try {
            return (c && c.name && c.name()) || (c && c.nick && c.nick()) || '?'
        } catch (e) {
            return '?'
        }
    }

    function clientUid(c) {
        try {
            return (c && c.uid && c.uid()) || ''
        } catch (e) {
            return ''
        }
    }

    function clientSessionId(c) {
        try {
            return (c && c.id && String(c.id())) || '?'
        } catch (e) {
            return '?'
        }
    }

    function clientDatabaseId(c) {
        try {
            if (c && typeof c.databaseId === 'function') {
                return String(c.databaseId())
            }
        } catch (e) {}
        return '?'
    }

    function formatClientIds(c) {
        var groups = []
        try {
            (c.getServerGroups() || []).forEach(function (g) {
                try {
                    groups.push(g.name() + '(' + g.id() + ')')
                } catch (e0) {}
            })
        } catch (e1) {}
        return [
            '昵称：' + clientNick(c),
            'UID：' + (clientUid(c) || '?'),
            'Database ID：' + clientDatabaseId(c),
            'Session ID：' + clientSessionId(c) + '（每次重连可能变）',
            '服务器组：' + (groups.length ? groups.join(', ') : '（无）')
        ].join('\n')
    }

    function replyMe(client) {
        var lines = [prefix + ' 你的身份信息：', formatClientIds(client)]
        lines.push('配置忽略列表等请用 UID（不是 Session ID）。')
        client.chat(lines.join('\n'))
    }

    function findOnlineByNick(query) {
        var q = String(query || '').trim().toLowerCase()
        if (!q) {
            return []
        }
        var all = []
        try {
            all = backend.getClients() || []
        } catch (e) {
            return []
        }
        var exact = []
        var partial = []
        for (var i = 0; i < all.length; i++) {
            var c = all[i]
            var nick = clientNick(c).toLowerCase()
            if (!nick || nick === '?') {
                continue
            }
            if (nick === q) {
                exact.push(c)
            } else if (nick.indexOf(q) !== -1) {
                partial.push(c)
            }
        }
        return exact.length ? exact : partial
    }

    function replyWho(client, nickQuery) {
        var q = String(nickQuery || '').trim()
        if (!q) {
            client.chat(prefix + ' 用法：!wm who <在线昵称或关键词>')
            return
        }
        var hits = findOnlineByNick(q)
        if (!hits.length) {
            client.chat(prefix + ' 未找到在线用户匹配「' + q + '」（只能查当前在线）。')
            return
        }
        var lines = [prefix + ' 匹配到 ' + hits.length + ' 个在线用户：']
        for (var i = 0; i < hits.length; i++) {
            lines.push('——')
            lines.push(formatClientIds(hits[i]))
        }
        chatChunks(client, lines)
    }

    function replyOnline(client) {
        var all = []
        try {
            all = backend.getClients() || []
        } catch (e) {
            client.chat(prefix + ' 读取在线列表失败：' + e)
            return
        }
        var lines = [prefix + ' 当前在线 ' + all.length + ' 人：']
        for (var i = 0; i < all.length; i++) {
            var c = all[i]
            lines.push(clientNick(c) + ' | UID ' + (clientUid(c) || '?') + ' | db ' + clientDatabaseId(c))
        }
        lines.push('详情：!wm who <昵称>')
        chatChunks(client, lines)
    }

    var commandsRegistered = false

    // Fallback chat handler if Command Library is missing
    event.on('chat', function (ev) {
        if (config.enableWmCommands === false) {
            return
        }
        if (!ev || !ev.client || !ev.text || commandsRegistered) {
            return
        }
        var raw = String(ev.text).trim()
        var text = raw.toLowerCase()
        if (text === '!wm ignore' || text === '!wmp ignore') {
            doIgnore(ev.client)
            return
        }
        if (text === '!wm unignore' || text === '!wmp unignore') {
            doUnignore(ev.client)
            return
        }
        if (text === '!wm groups' || text === '!wm mygroups' || text === '!wmp groups') {
            replyMyGroups(ev.client)
            return
        }
        if (text === '!wm allgroups' || text === '!wmp allgroups') {
            replyAllGroups(ev.client)
            return
        }
        if (text === '!wm channels' || text === '!wm allchannels' || text === '!wmp channels') {
            replyAllChannels(ev.client)
            return
        }
        if (text === '!wm me' || text === '!wmp me') {
            replyMe(ev.client)
            return
        }
        if (text === '!wm online' || text === '!wmp online') {
            replyOnline(ev.client)
            return
        }
        var whoMatch = raw.match(/^!(?:wm|wmp)\s+(?:who|user)\s+(.+)$/i)
        if (whoMatch) {
            replyWho(ev.client, whoMatch[1])
        }
    })

    event.on('load', function () {
        if (config.enableWelcome === false) {
            engine.log(TAG + ' v1.0.9 join welcome DISABLED (community-bot can own greetings)')
        } else {
            engine.log(TAG + ' v1.0.9 join welcome ENABLED')
        }
        if (config.enableWmCommands === false) {
            engine.log(TAG + ' !wm commands DISABLED on this script')
            return
        }
        var command = null
        try {
            command = require('command')
        } catch (e0) {
            command = null
        }
        if (!command || typeof command.createCommandGroup !== 'function') {
            engine.log(TAG + ' command.js missing — !wm uses chat fallback (may show "no enabled command")')
            return
        }

        function registerWm(name) {
            var group = command.createCommandGroup(name)
                .help('Welcome message helpers')
                .manual('!wm ignore|unignore|groups|allgroups|channels|me|online|who <nick>')

            group.addCommand('ignore')
                .help('Stop receiving welcome messages')
                .exec(function (client) { doIgnore(client) })

            group.addCommand('unignore')
                .help('Receive welcome messages again')
                .exec(function (client) { doUnignore(client) })

            group.addCommand('groups')
                .help('Show your server group IDs')
                .exec(function (client) { replyMyGroups(client) })

            group.addCommand('mygroups')
                .help('Show your server group IDs')
                .exec(function (client) { replyMyGroups(client) })

            group.addCommand('allgroups')
                .help('List all server groups')
                .exec(function (client) { replyAllGroups(client) })

            group.addCommand('channels')
                .help('List all channel IDs (cid)')
                .exec(function (client) { replyAllChannels(client) })

            group.addCommand('allchannels')
                .help('List all channel IDs (cid)')
                .exec(function (client) { replyAllChannels(client) })

            group.addCommand('me')
                .help('Show your uid / database id')
                .exec(function (client) { replyMe(client) })

            group.addCommand('online')
                .help('List online clients with uid')
                .exec(function (client) { replyOnline(client) })

            try {
                group.addCommand('who')
                    .help('Look up an online client by nick')
                    .manual('!wm who <nick> — partial match; online only')
                    .addArgument(function (args) {
                        return args.rest.setName('nick').min(1)
                    })
                    .exec(function (client, args) {
                        replyWho(client, args && args.nick)
                    })
            } catch (eWho) {
                engine.log(TAG + ' register who failed: ' + eWho)
            }

            try {
                group.addCommand('user')
                    .help('Alias of who')
                    .addArgument(function (args) {
                        return args.rest.setName('nick').min(1)
                    })
                    .exec(function (client, args) {
                        replyWho(client, args && args.nick)
                    })
            } catch (eUser) {
                engine.log(TAG + ' register user failed: ' + eUser)
            }
        }

        try {
            registerWm('wm')
            registerWm('wmp')
            commandsRegistered = true
            engine.log(TAG + ' v1.0.9 registered !wm / !wmp via Command Library')
        } catch (e1) {
            engine.log(TAG + ' register !wm failed: ' + e1)
        }
    })

    engine.log(TAG + ' v1.0.9 loaded — welcome=' +
        (config.enableWelcome === false ? 'off' : 'on') +
        ' wmCommands=' + (config.enableWmCommands === false ? 'off' : 'on'))
})








