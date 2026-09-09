# YouTube cookies（不额外开端口）
#
# SinusBot 启动时 entrypoint 会生成 data/yt-dlp-wrapper.sh，
# 若存在 data/youtube-cookies.txt 则自动带 --cookies。
#
# ## 设置步骤
#
# 1. 本机浏览器登录 YouTube，用扩展导出 Netscape 格式 cookies.txt
#    （推荐：Get cookies.txt LOCALLY，站点选 youtube.com）
#
# 2. 拷到服务器 compose 目录的 data/ 下，文件名必须是：
#      data/youtube-cookies.txt
#
#    示例：
#      scp cookies.txt user@server:/path/to/sinusbot-docker/data/youtube-cookies.txt
#    或已在服务器上：
#      cp /path/to/cookies.txt ./data/youtube-cookies.txt
#
# 3. 推荐：安装 yt-dlp 格式配置（仓库根目录有示例）
#      cp yt-dlp.conf.example data/yt-dlp.conf
#    不要用 `-f 18` / `-f 18/best`：很多视频已无 format 18，会 exit 1 并连环跳歌。
#    无 conf 时 entrypoint 会自动写入安全默认；若检测到 conf 里写了 format 18 也会自动替换并备份。
#
# 4. 重启并验证：
#      docker restart sinusbot
#      docker exec -it sinusbot /opt/sinusbot/data/yt-dlp-wrapper.sh \
#        --print "%(id)s %(format_id)s" --get-url "https://www.youtube.com/watch?v=lA9FONoiuFA"
#
# 5. SinusBot WebUI：Stop + Clear，再播 YouTube / 歌单
#
# ## 可选：本地临时起网页（默认不部署、不占公网端口）
#
# tools/yt-cookies-web/server.py 仍保留。若只想本机用：
#   COOKIE_ADMIN_PASSWORD=secret \\
#   COOKIE_FILE=$PWD/data/youtube-cookies.txt \\
#   YTDLP_CONF=$PWD/data/yt-dlp.conf \\
#   COOKIES_PATH_IN_BOT=/opt/sinusbot/data/youtube-cookies.txt \\
#   BIND=127.0.0.1:8099 \\
#   python3 tools/yt-cookies-web/server.py
# 然后浏览器打开 http://127.0.0.1:8099（仅本机）。
