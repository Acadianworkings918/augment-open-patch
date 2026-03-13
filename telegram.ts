import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface PushMessage {
  version: string;
  filePath: string;
  pushTime: string;
  fileSize?: string;
  changelog?: string;
}

export class TelegramPusher {
  private bot: TelegramBot;
  private chatId: string;

  constructor(config: TelegramConfig) {
    this.bot = new TelegramBot(config.botToken, { polling: false });
    this.chatId = config.chatId;
  }

  /**
   * 推送文件到Telegram
   */
  async pushFile(message: PushMessage): Promise<boolean> {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(message.filePath)) {
        throw new Error(`文件不存在: ${message.filePath}`);
      }

      // 获取文件信息
      const stats = fs.statSync(message.filePath);
      const fileSize = this.formatFileSize(stats.size);
      const fileName = path.basename(message.filePath);

      // 构建完整的文件说明文本
      const caption = this.buildFileCaption({
        ...message,
        fileSize,
        fileName
      });

      // 直接发送文件和完整信息
      await this.bot.sendDocument(this.chatId, message.filePath, {
        caption: caption,
        parse_mode: "Markdown"
      });

      console.log(`✅ 成功推送到Telegram: ${fileName}`);
      return true;

    } catch (error) {
      console.error("❌ 推送到Telegram失败:", error);
      return false;
    }
  }

  /**
   * 发送纯文本消息
   */
  async sendMessage(text: string): Promise<boolean> {
    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: "Markdown"
      });
      return true;
    } catch (error) {
      console.error("发送消息失败:", error);
      return false;
    }
  }

  /**
   * 发送错误通知
   */
  async sendErrorNotification(error: string, version?: string): Promise<void> {
    const errorMessage = `
❌ *处理失败通知*

🔢 版本: ${version || '未知'}
⏰ 时间: ${new Date().toLocaleString('zh-CN')}
🚨 错误: ${error}
    `.trim();

    try {
      await this.sendMessage(errorMessage);
    } catch (err) {
      console.error("发送错误通知失败:", err);
    }
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(2);

    return `${size} ${sizes[i]}`;
  }

  /**
   * 构建文件说明文本
   */
  private buildFileCaption(message: PushMessage & { fileSize: string; fileName: string }): string {
    const { version, fileSize, pushTime, changelog, fileName } = message;
    const text = `
📦 ${fileName}
🔢 版本: ${version}
📏 大小: ${fileSize}
⏰ 推送时间: ${pushTime}

🎯 功能特性:
• 集成网关一键登录

📥 安装方法:
1. 下载附件中的 .vsix 文件
2. 在 VSCode 中按 \`Ctrl+Shift+P\`
3. 输入 "Install from VSIX"
4. 选择下载的文件进行安装
5. 更新可直接拖拽覆盖更新

⚠️ 注意事项:
• 如有问题请及时反馈
    `.trim();

    if (changelog) {
      return `${text}\n\n📝 更新日志:\n${changelog}`;
    }
    return text;
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const me = await this.bot.getMe();
      console.log(`✅ Telegram机器人连接成功: @${me.username}`);
      return true;
    } catch (error) {
      console.error("❌ Telegram机器人连接失败:", error);
      return false;
    }
  }
}
