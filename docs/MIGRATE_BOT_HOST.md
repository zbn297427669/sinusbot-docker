# 迁移 SinusBot 主机（TeamSpeak 服务器可不变）

只换跑 `sinusbot-docker` 的机器时，实例配置、脚本、cookies、yt-dlp 配置都在部署目录的挂载里。  
**远程 TS（例如 `sh.teamspeak.work`）不换** → 一般只需带走 `data/` + `scripts/` + `entrypoint.sh`。

## 要带走的内容

| 路径 | 必须 | 说明 |
|---|---|---|
| `data/` | 是 | `config.ini`、DB、身份、歌单、头像、`youtube-cookies.txt`、`yt-dlp.conf` 等 |
| `scripts/` | 强烈建议 | 自定义脚本（AFK / AloneMode / PlaybackGuard / Watchdog…） |
| `entrypoint.sh` | 强烈建议 | yt-dlp cookies wrapper |
| `docker-compose.yml` | 建议 | 端口与挂载 |
| `.env` | 可选 | 有自定义环境变量时 |
| `teamspeak/` | 可选 | 仅当你在用 compose 里的**本地** TS6 时；`INCLUDE_TS=1` 才会打进包 |

脚本打成一个 `.tgz`；默认输出到 `backups/`。

## 旧机：备份

在**当前部署目录**（含 `data/`）执行：

```bash
chmod +x scripts/backup-bot-host.sh scripts/restore-bot-host.sh

# 推荐：先停 Bot，避免库写到一半
STOP=1 ./scripts/backup-bot-host.sh

# 或指定输出路径
STOP=1 ./scripts/backup-bot-host.sh /tmp/sinusbot-backup.tgz

# 若本机还跑了 compose 里的 teamspeak 服务，一并打包：
# INCLUDE_TS=1 STOP=1 ./scripts/backup-bot-host.sh
```

把生成的 `.tgz` 拷到新机（`scp` / `rsync` 等）。

**旧机保持停止**，直到新机启动成功，避免同一身份/昵称双开。

## 新机：恢复并启动

```bash
# 1. 拿到代码（你的 fork）
git clone https://github.com/zbn297427669/sinusbot-docker.git
cd sinusbot-docker
chmod +x scripts/backup-bot-host.sh scripts/restore-bot-host.sh

# 2. 恢复备份（目标目录已有 data/ 时加 --force）
./scripts/restore-bot-host.sh /path/to/sinusbot-backup.tgz --force

# 3. 确认旧机已 stop，再启动
docker compose pull
docker compose up -d sinusbot
docker compose logs -f --tail=80 sinusbot
```

也可一步启动：

```bash
START=1 ./scripts/restore-bot-host.sh /path/to/backup.tgz --force
```

恢复脚本会把 `data/`、`scripts/` 的属主设为 `9987:9987`（可用 `DATA_UID` / `DATA_GID` 覆盖）。

## 验收

- WebUI `http://<新IP>:9987` 可打开，实例 **Connected**
- 日志出现 `Connection established`
- 自定义脚本仍在 Scripts 里勾选可用
- YouTube / 歌单能播（cookies + `yt-dlp.conf` 在 `data/` 里）

## 常见问题

| 现象 | 处理 |
|---|---|
| 权限错误 / 容器起不来 | `sudo chown -R 9987:9987 data scripts` |
| `nickname is already in use` | 旧机还在线；先 `docker compose stop sinusbot` |
| YouTube 连环跳歌 | 检查 `data/yt-dlp.conf`，勿用 `-f 18`；见 `yt-dlp.conf.example` |
| git pull 改不了 `scripts/` | `sudo chown -R ubuntu:ubuntu scripts` → pull → 再 `chown 9987:9987` |
