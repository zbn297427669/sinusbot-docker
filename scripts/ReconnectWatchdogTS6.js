/**
 * ReconnectWatchdogTS6.js
 *
 * SinusBot WebUI "Running" means the instance process is started — NOT that
 * the embedded TS client is still on the server. After some disconnects the
 * client sets want autoreconnect = 0 and stops retrying, while the UI stays
 * green.
 *
 * Worse zombie: backend.isConnected() === false, but backend.connect() is a
 * no-op and core logs "Already online." Soft reconnect never recovers — need
 * disconnect() then connect(), or WebUI Stop/Start / container restart.
 */

registerPlugin({
    name: 'Reconnect Watchdog TS6',
    version: '1.1.0',
    backends: ['ts3', 'discord'],
    description: 'Auto-reconnect when dropped from TS; escalate zombie Already-online state.',
    author: 'local',
    vars: [{
        name: 'enabled',
        title: 'Enable watchdog',
        type: 'checkbox',
        default: true
    }, {
        name: 'checkIntervalSec',
        title: 'Check interval (seconds)',
        type: 'number',
        placeholder: '30'
    }, {
        name: 'minDownSec',
        title: 'Require offline for at least N seconds before reconnect (avoid flapping)',
        type: 'number',
        placeholder: '15'
    }, {
        name: 'cooldownSec',
        title: 'Minimum seconds between reconnect attempts',
        type: 'number',
        placeholder: '60'
    }, {
        name: 'verifyDelaySec',
        title: 'Seconds to wait after connect() before verifying isConnected()',
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

    const TAG = '[ReconnectWatchdog]'
    const enabled = config.enabled !== false
    const intervalMs = Math.max(5, parseInt(config.checkIntervalSec, 10) || 30) * 1000
    const minDownMs = Math.max(0, parseInt(config.minDownSec, 10) || 15) * 1000
    const cooldownMs = Math.max(10, parseInt(config.cooldownSec, 10) || 60) * 1000
    const verifyDelayMs = Math.max(3, parseInt(config.verifyDelaySec, 10) || 8) * 1000
    const debugLog = config.debugLog === true

    let downSince = 0
    let lastAttempt = 0
    let connecting = false
    let zombieStreak = 0

    function log(msg) {
        engine.log(`${TAG} ${msg}`)
    }

    function dlog(msg) {
        if (debugLog) {
            log(msg)
        }
    }

    function isUp() {
        try {
            if (!backend.isConnected()) {
                return false
            }
            // Prefer a live bot client when the API exposes it
            try {
                const bot = backend.getBotClient && backend.getBotClient()
                if (bot === null || bot === undefined) {
                    return false
                }
            } catch (e) {
                // getBotClient optional — isConnected alone is enough
            }
            return true
        } catch (e) {
            return false
        }
    }

    function callConnect() {
        try {
            return !!backend.connect()
        } catch (e) {
            log(`backend.connect() threw: ${e}`)
            return false
        }
    }

    function callDisconnect() {
        try {
            return !!backend.disconnect()
        } catch (e) {
            log(`backend.disconnect() threw: ${e}`)
            return false
        }
    }

    function markRecovered() {
        downSince = 0
        connecting = false
        zombieStreak = 0
        dlog('recovered — cleared down timer')
    }

    function finishAttempt() {
        connecting = false
    }

    function hardReconnect(reason) {
        zombieStreak += 1
        log(`zombie/hard reconnect (streak=${zombieStreak}) — ${reason}`)
        callDisconnect()
        setTimeout(() => {
            const ok = callConnect()
            log(`hard backend.connect() => ${ok}`)
            setTimeout(() => {
                if (isUp()) {
                    log('hard reconnect OK')
                    markRecovered()
                    return
                }
                finishAttempt()
                log(
                    'HARD RECOVER FAILED — instance zombie. ' +
                    'WebUI: Stop then Start this instance, or on host: ' +
                    'docker compose restart sinusbot'
                )
            }, verifyDelayMs)
        }, 2000)
    }

    function tryReconnect(reason) {
        const now = Date.now()
        if (connecting) {
            return
        }
        if (now - lastAttempt < cooldownMs) {
            dlog(`skip reconnect (cooldown) reason=${reason}`)
            return
        }
        lastAttempt = now
        connecting = true
        log(`offline detected — calling backend.connect() (${reason})`)
        const softOk = callConnect()
        log(`backend.connect() => ${softOk}`)

        // Soft connect often returns true + core logs "Already online." while
        // still not actually on the server. Verify after a short wait.
        setTimeout(() => {
            if (isUp()) {
                log('soft reconnect OK')
                markRecovered()
                return
            }
            hardReconnect(
                softOk
                    ? 'connect() true but still !isConnected (Already online zombie)'
                    : 'connect() false / still offline'
            )
        }, verifyDelayMs)
    }

    function tick() {
        if (!enabled) {
            return
        }
        if (connecting) {
            return
        }
        if (isUp()) {
            if (downSince) {
                dlog('back online')
            }
            downSince = 0
            zombieStreak = 0
            return
        }
        const now = Date.now()
        if (!downSince) {
            downSince = now
            dlog('became offline')
            return
        }
        if (now - downSince < minDownMs) {
            return
        }
        tryReconnect(`down for ${Math.round((now - downSince) / 1000)}s`)
    }

    if (!enabled) {
        log('disabled')
        return
    }

    event.on('disconnect', () => {
        dlog('event disconnect')
        if (!downSince) {
            downSince = Date.now()
        }
    })

    event.on('connectionFailed', (reason) => {
        log(`connectionFailed: ${reason}`)
        if (!downSince) {
            downSince = Date.now()
        }
        tryReconnect('connectionFailed')
    })

    event.on('connect', () => {
        markRecovered()
        dlog('event connect')
    })

    setInterval(tick, intervalMs)
    setTimeout(tick, 10000)
    log(
        `v1.1.0 loaded — interval=${intervalMs / 1000}s minDown=${minDownMs / 1000}s ` +
        `cooldown=${cooldownMs / 1000}s verify=${verifyDelayMs / 1000}s`
    )
})
