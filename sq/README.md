# OneNav Lite (单用户服务器版)

纯 HTML + CSS + 原生 JavaScript 前端，配一个零依赖 Node.js 后端。  
适合个人自用：一处部署，多设备同步。

## 1. 功能

- 分类导航、搜索、添加/编辑/删除
- 浏览器书签 HTML 导入/导出
- 只输入 URL 时自动获取网页标题（失败自动回退域名）
- 服务器持久化（`data/bookmarks.json`）
- 可选基础认证（Basic Auth）

## 2. 本地启动

```bash
node -v
# 需要 Node.js >= 18

npm start
```

默认访问地址：`http://127.0.0.1:3080`

## 3. 环境变量（可选）

- `PORT`：端口，默认 `3080`
- `HOST`：监听地址，默认 `0.0.0.0`
- `DATA_DIR`：数据目录，默认 `./data`
- `DATA_FILE`：数据文件，默认 `./data/bookmarks.json`
- `BASIC_USER`：基础认证用户名（设置后启用认证）
- `BASIC_PASS`：基础认证密码

说明：自动获取网页标题需要服务器可访问公网目标网站。

示例：

```bash
BASIC_USER=admin BASIC_PASS=ChangeMe123 PORT=3080 npm start
```

## 4. Linux 服务器部署（systemd）

假设项目目录：`/opt/onenav-lite`

```bash
cd /opt/onenav-lite
npm start
```

创建服务文件 `/etc/systemd/system/onenav-lite.service`：

```ini
[Unit]
Description=OneNav Lite
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/onenav-lite
Environment=NODE_ENV=production
Environment=PORT=3080
Environment=BASIC_USER=admin
Environment=BASIC_PASS=ChangeMe123
ExecStart=/usr/bin/node /opt/onenav-lite/server.js
Restart=always
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now onenav-lite
sudo systemctl status onenav-lite
```

## 5. Nginx 反向代理（建议）

```nginx
server {
    listen 80;
    server_name nav.example.com;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

再用 Certbot 或 Caddy 加 HTTPS。

## 6. 备份

只需要备份一个文件：

```bash
cp /opt/onenav-lite/data/bookmarks.json /opt/backup/bookmarks_$(date +%F).json
```
