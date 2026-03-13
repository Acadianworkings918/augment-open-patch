# Augment VSCode 插件自动Patch工具

[English](./README_EN.md) | 中文

这是一个自动化工具，用于监控 Augment VSCode 插件的更新，自动下载、patch并推送到Telegram机器人。

## 功能特性

- 🔄 **自动监控**: 每小时检查插件是否有新版本
- 🛠️ **自动处理**: 自动下载、解包、注入、重新打包
- 📱 **Telegram推送**: 自动推送处理好的文件到TG机器人
- 📊 **版本管理**: 智能版本跟踪和历史记录
- 🧹 **自动清理**: 自动清理旧版本文件
- ⚡ **实时通知**: 处理状态实时推送

## 截图预览

<table>
  <tr>
    <td align="center"><b>启动菜单</b><br/><img src="./screenshots/startup-menu.png" width="400"/></td>
    <td align="center"><b>Patch处理过程</b><br/><img src="./screenshots/patch-process.png" width="400"/></td>
  </tr>
  <tr>
    <td align="center"><b>Telegram推送通知</b><br/><img src="./screenshots/telegram-push.png" width="400"/></td>
    <td align="center"><b>VSCode最终效果</b><br/><img src="./screenshots/vscode-result.png" width="400"/></td>
  </tr>
</table>

## 安装依赖

```bash
npm install
```

## 配置环境变量

1. 复制环境变量模板：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填入必要的配置：

```env
# Telegram机器人配置
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# 检查间隔配置（分钟）
CHECK_INTERVAL_MINUTES=60

# 插件配置
PUBLISHER=augment
EXTENSION=vscode-augment

# 工作目录
WORK_DIR=./augment-plugins

# 是否启用自动清理
AUTO_CLEANUP=true

# 保留的版本数量（建议设为1，只保留最新版本）
KEEP_VERSIONS=1
```

### 获取Telegram配置

1. **创建机器人**:
   - 在Telegram中搜索 `@BotFather`
   - 发送 `/newbot` 创建新机器人
   - 按提示设置机器人名称和用户名
   - 获取 `TELEGRAM_BOT_TOKEN`

2. **获取Chat ID**:
   - 将机器人添加到目标群组或频道
   - 发送一条消息给机器人
   - 访问 `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - 在返回的JSON中找到 `chat.id`

## 使用方法

### 使用启动脚本（推荐）

项目提供了一个交互式启动脚本 `start.sh`，它会自动完成环境检查并提供便捷的操作菜单。

```bash
# 添加执行权限（首次使用）
chmod +x start.sh

# 运行启动脚本
./start.sh
```

脚本启动后会自动进行以下检查：
- ✅ 检查 Node.js 和 npm 是否已安装
- ✅ 检查 `.env` 配置文件是否存在（不存在则自动从 `.env.example` 复制）
- ✅ 检查 `node_modules` 依赖是否已安装（未安装则自动执行 `npm install`）
- ✅ 检查 `inject.txt` 注入代码文件是否存在
- ✅ 自动创建工作目录 `augment-plugins`

环境检查通过后，脚本会显示交互式菜单：

```
请选择运行模式:
  1) 监听最新版本 - 持续监听并自动处理新版本
  2) 处理指定版本 - 输入版本号下载处理后退出
  3) 退出
```

- **选项 1**：启动调度器，持续监听插件更新，发现新版本自动处理并推送
- **选项 2**：手动输入指定版本号（如 `0.688.0`），下载处理后退出
- **选项 3**：退出脚本

### 使用npm命令

#### 启动自动监控

```bash
npm start
```

#### 开发模式（自动重启）

```bash
npm run dev
```

#### 手动执行一次patch

```bash
npm run patch-once
```

#### 处理指定版本

```bash
# 处理指定版本
npm run patch-version -- 0.688.0

# 处理最新版本
npm run patch-latest
```

#### 编译TypeScript

```bash
npm run build
```

### Docker部署

#### 使用Docker Compose（推荐）

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止服务
docker-compose down
```

#### 使用Docker

```bash
# 1. 构建镜像
docker build -t augment-patch .

# 2. 运行容器
docker run -d \
  --name augment-patch \
  --env-file .env \
  -v $(pwd)/augment-plugins:/app/augment-plugins \
  -v $(pwd)/inject.txt:/app/inject.txt:ro \
  augment-patch

# 3. 查看日志
docker logs -f augment-patch
```

## 文件结构

```
augment-patch/
├── augmentExt.ts          # 核心patch逻辑
├── scheduler.ts           # 定时任务调度器
├── patch-once.ts          # 单次patch处理（支持指定版本）
├── telegram.ts            # Telegram推送功能
├── version-tracker.ts     # 版本跟踪管理
├── inject.txt             # 注入代码
├── start.sh               # 交互式启动脚本
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript配置
├── .env.example           # 环境变量模板
├── .env                   # 环境变量配置（需要创建）
├── Dockerfile             # Docker镜像构建文件
├── docker-compose.yml     # Docker Compose配置
├── .dockerignore          # Docker忽略文件
├── screenshots/           # 项目截图
└── augment-plugins/       # 工作目录
    ├── version-history.json    # 版本历史记录
    ├── current-version.json    # 当前版本信息
    └── *.vsix                  # 处理后的插件文件（只保留最新版本）
```

## 工作流程

1. **定时检查**: 每隔指定时间检查插件是否有新版本
2. **版本比较**: 与本地记录的最新版本进行比较
3. **自动下载**: 发现新版本时自动下载原始插件
4. **解包处理**: 解压插件文件并注入自定义代码
5. **重新打包**: 将修改后的文件重新打包为.vsix格式
6. **推送通知**: 将处理结果推送到Telegram
7. **版本记录**: 更新本地版本历史记录
8. **清理维护**: 自动删除旧版本文件，只保留最新版本

## 注意事项

- 确保 `inject.txt` 文件包含正确的注入代码
- 首次运行时会立即执行一次检查
- 处理过程中会发送详细的状态通知
- 错误信息会自动推送到Telegram
- 建议在服务器上使用 PM2 等进程管理工具运行

## 故障排除

### 常见问题

1. **Telegram连接失败**
   - 检查 `TELEGRAM_BOT_TOKEN` 是否正确
   - 确认机器人已启动且有发送消息权限

2. **无法获取版本信息**
   - 检查网络连接
   - 确认插件名称配置正确

3. **文件处理失败**
   - 检查 `inject.txt` 文件是否存在
   - 确认工作目录有写入权限

4. **start.sh 无法执行**
   - 确认已添加执行权限: `chmod +x start.sh`
   - 确认使用 bash 或 zsh 终端

### 日志查看

程序会输出详细的日志信息，包括：
- 版本检查结果
- 处理进度
- 错误信息
- 推送状态

## 许可证

MIT License
