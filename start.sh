#!/bin/bash

# Augment Patch 启动脚本

echo "🚀 Augment Patch 自动化工具"
echo "================================"

# 检查Node.js版本
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未找到 npm"
    exit 1
fi

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "⚠️  警告: 未找到 .env 文件"
    echo "📋 正在复制 .env.example 到 .env..."
    cp .env.example .env
    echo "✅ 请编辑 .env 文件并填入正确的配置，然后重新运行此脚本"
    exit 1
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 检查必要文件
if [ ! -f "inject.txt" ]; then
    echo "❌ 错误: 未找到 inject.txt 文件"
    exit 1
fi

# 创建工作目录
mkdir -p augment-plugins

echo "✅ 环境检查完成"
echo ""

# 显示菜单
show_menu() {
    echo "请选择运行模式:"
    echo "  1) 监听最新版本 - 持续监听并自动处理新版本"
    echo "  2) 处理指定版本 - 输入版本号下载处理后退出"
    echo "  3) 退出"
    echo ""
}

# 处理指定版本
process_specific_version() {
    echo ""
    read -p "请输入版本号 (例如: 0.688.0): " version
    
    # 验证版本号格式
    if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "❌ 错误: 无效的版本号格式，请使用 x.x.x 格式"
        exit 1
    fi
    
    echo ""
    echo "🔧 开始处理版本 $version..."
    npx tsx patch-once.ts "$version"
}

# 监听最新版本
watch_latest_version() {
    echo ""
    echo "🎯 启动调度器，监听最新版本..."
    npm start
}

# 主逻辑
show_menu
read -p "请输入选项 [1-3]: " choice

case $choice in
    1)
        watch_latest_version
        ;;
    2)
        process_specific_version
        ;;
    3)
        echo "👋 再见!"
        exit 0
        ;;
    *)
        echo "❌ 无效的选项，请输入 1、2 或 3"
        exit 1
        ;;
esac
