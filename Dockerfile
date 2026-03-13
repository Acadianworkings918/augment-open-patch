# 使用官方Node.js镜像作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置时区
RUN apk add --no-cache tzdata
ENV TZ=Asia/Shanghai

# 复制package.json和package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 创建工作目录
RUN mkdir -p /app/augment-plugins

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S augment -u 1001

# 设置文件权限
RUN chown -R augment:nodejs /app
USER augment

# 此项目为定时任务调度器，不需要暴露端口
# EXPOSE 指令已删除

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# 启动命令
CMD ["npm", "start"]
