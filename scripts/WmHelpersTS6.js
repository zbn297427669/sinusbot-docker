/**
 * WmHelpersTS6.js
 *
 * SinusBot-only server info helpers (full group/channel names via engine cache).
 * Does NOT send join greetings — use teamspeak-community-bot for welcome.
 *
 * Uses prefix !si (server info) so it does NOT collide with community-bot !wm.
 *
 * Commands:
 *   !si help
 *   !si groups / mygroups   — your server groups (id + name)
 *   !si allgroups           — all server groups (id + name)
 *   !si channels            — all channels (cid + name)
 *   !si me                  — your uid / database id / groups
 *   !si online              — online nicknames
 *   !si who <nick>          — look up online client details
 */

registerPlugin({
    name: 'WM Helpers TS6',
    version: '1.0.0',
    engine: '>= 0.9.21',
    backends: ['ts3'],
    description: 'Server group/channel lookup via SinusBot engine (!si). No welcome spam.',
    author: 'local',
    vars: [
        {
            name: 'prefix',
            title: 'Reply prefix (plain text)',
            type: 'string',
            placeholder: '[查询]'
        }
    ]
}, function (_sinusbot, config) {
    var engine = require('engine')
    var backend = require('backend')
    var event = require('event')

    var TAG = '[WM Helpers TS6]'
    var prefix = (config.prefix && String(config.prefix).trim())
        ? String(config.prefix).trim()
        : '[查询]'

    function formatGroupLine(g) {
        var id = '?'
        var name = '?'
        try { id = String(g.id()) } catch (e0) {}
        try { name = String(g.name()) } catch (e1) {}
        return 'ID ' + id + ' — ' + name
    }

    function formatChannelLine(ch) {
        var id = '?'
        var name = '?'
        try { id = String(ch.id()) } catch (e0) {}
        try { name = String(ch.name()) } catch (e1) {}
        return 'cid ' + id + ' — ' + name
    }

    function chatChunks(client, lines) {
        var maxChars = 850
        var buf = []
        var len = 0
        function flush() {
            if (!buf.length) return
            try { client.chat(buf.join('\n')) } catch (e) {
                engine.log(TAG + ' chatChunks failed: ' + e)
            }
            buf = []
            len = 0
        }
        for (var i = 0; i < lines.length; i++) {
            var line = String(lines[i] || '')
            var add = line.length + (buf.length ? 1 : 0)
            if (buf.length && len + add > maxChars) flush()
            buf.push(line)
            len += add
        }
        flush()
    }

    function replyHelp(client) {
        client.chat([
            prefix + ' 服务器信息查询（SinusBot 引擎，可列完整组名）：',
            '!si groups — 你的服务器组',
            '!si allgroups — 本服全部服务器组',
            '!si channels — 本服全部频道',
            '!si me — 你的 UID / Database ID',
            '!si online — 在线昵称列表',
            '!si who <昵称> — 查在线用户详情',
            '欢迎语 / !wm ignore 请用社区 Bot。'
        ].join('\n'))
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
        lines.push('管理组 ID 填社区 Bot：welcome.team_group_ids')
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
        lines.push('cid 填社区 Bot：bot.channel_id / leaderboard.channel_id')
        chatChunks(client, lines)
    }

    function clientNick(c) {
        try {
            return (c && c.name && c.name()) || (c && c.nick && c.nick()) || '?'
        } catch (e) {
            return '?'
        }
    }

    function clientUid(c) {
        try { return (c && c.uid && c.uid()) || '' } catch (e) { return '' }
    }

    function clientSessionId(c) {
        try { return (c && c.id && String(c.id())) || '?' } catch (e) { return '?' }
    }

    function clientDatabaseId(c) {
        try {
            if (c && typeof c.databaseId === 'function') return String(c.databaseId())
        } catch (e) {}
        return '?'
    }

    function formatClientIds(c) {
        var groups = []
        try {
            (c.getServerGroups() || []).forEach(function (g) {
                try { groups.push(g.name() + '(' + g.id() + ')') } catch (e0) {}
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
        client.chat([
            prefix + ' 你的身份信息：',
            formatClientIds(client),
            '配置忽略列表请用 UID（不是 Session ID）。'
        ].join('\n'))
    }

    function findOnlineByNick(query) {
        var q = String(query || '').trim().toLowerCase()
        if (!q) return []
        var all = []
        try { all = backend.getClients() || [] } catch (e) { return [] }
        var exact = []
        var partial = []
        for (var i = 0; i < all.length; i++) {
            var nick = clientNick(all[i]).toLowerCase()
            if (!nick || nick === '?') continue
            if (nick === q) exact.push(all[i])
            else if (nick.indexOf(q) !== -1) partial.push(all[i])
        }
        return exact.length ? exact : partial
    }

    function replyWho(client, nickQuery) {
        var q = String(nickQuery || '').trim()
        if (!q) {
            client.chat(prefix + ' 用法：!si who <在线昵称或关键词>')
            return
        }
        var hits = findOnlineByNick(q)
        if (!hits.length) {
            client.chat(prefix + ' 未找到在线用户匹配「' + q + '」')
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
        try { all = backend.getClients() || [] } catch (e) {
            client.chat(prefix + ' 读取在线列表失败：' + e)
            return
        }
        var lines = [prefix + ' 当前在线 ' + all.length + ' 人：']
        for (var i = 0; i < all.length; i++) {
            lines.push((i + 1) + '. ' + clientNick(all[i]))
        }
        lines.push('详情：!si who <昵称>')
        chatChunks(client, lines)
    }

    function dispatch(client, raw) {
        var text = String(raw || '').trim()
        var low = text.toLowerCase()
        if (low === '!si' || low === '!si help' || low === '!sinfo' || low === '!sinfo help') {
            replyHelp(client)
            return
        }
        if (low === '!si groups' || low === '!si mygroups' || low === '!sinfo groups') {
            replyMyGroups(client)
            return
        }
        if (low === '!si allgroups' || low === '!sinfo allgroups') {
            replyAllGroups(client)
            return
        }
        if (low === '!si channels' || low === '!si allchannels' || low === '!sinfo channels') {
            replyAllChannels(client)
            return
        }
        if (low === '!si me' || low === '!sinfo me') {
            replyMe(client)
            return
        }
        if (low === '!si online' || low === '!sinfo online') {
            replyOnline(client)
            return
        }
        var whoMatch = text.match(/^!(?:si|sinfo)\s+(?:who|user)\s+(.+)$/i)
        if (whoMatch) {
            replyWho(client, whoMatch[1])
        }
    }

    var commandsRegistered = false

    event.on('chat', function (ev) {
        if (!ev || !ev.client || !ev.text || commandsRegistered) return
        var raw = String(ev.text).trim()
        if (!/^!(?:si|sinfo)(\s|$)/i.test(raw)) return
        dispatch(ev.client, raw)
    })

    event.on('load', function () {
        var command = null
        try { command = require('command') } catch (e0) { command = null }
        if (!command || typeof command.createCommandGroup !== 'function') {
            engine.log(TAG + ' command.js missing — !si uses chat fallback')
            return
        }

        function registerSi(name) {
            var group = command.createCommandGroup(name)
                .help('Server info helpers (SinusBot engine)')
                .manual('!si groups|allgroups|channels|me|online|who <nick>')

            group.addCommand('help')
                .help('Show commands')
                .exec(function (client) { replyHelp(client) })

            group.addCommand('groups')
                .help('Your server groups')
                .exec(function (client) { replyMyGroups(client) })

            group.addCommand('mygroups')
                .help('Your server groups')
                .exec(function (client) { replyMyGroups(client) })

            group.addCommand('allgroups')
                .help('All server groups with names')
                .exec(function (client) { replyAllGroups(client) })

            group.addCommand('channels')
                .help('All channel cids')
                .exec(function (client) { replyAllChannels(client) })

            group.addCommand('allchannels')
                .help('All channel cids')
                .exec(function (client) { replyAllChannels(client) })

            group.addCommand('me')
                .help('Your uid / database id')
                .exec(function (client) { replyMe(client) })

            group.addCommand('online')
                .help('Online nicknames')
                .exec(function (client) { replyOnline(client) })

            try {
                group.addCommand('who')
                    .help('Look up online client')
                    .addArgument(function (args) {
                        return args.rest.setName('nick').min(1)
                    })
                    .exec(function (client, args) {
                        replyWho(client, args && args.nick)
                    })
            } catch (eWho) {
                engine.log(TAG + ' register who failed: ' + eWho)
            }
        }

        try {
            registerSi('si')
            registerSi('sinfo')
            commandsRegistered = true
            engine.log(TAG + ' v1.0.0 registered !si / !sinfo')
        } catch (e1) {
            engine.log(TAG + ' register !si failed: ' + e1)
        }
    })

    engine.log(TAG + ' v1.0.0 loaded — !si allgroups|channels|… (no welcome)')
})
