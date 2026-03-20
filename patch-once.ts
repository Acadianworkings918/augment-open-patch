import dotenv from "dotenv";
import { patchExtension, getExtensionVersions } from "./augmentExt";
import { TelegramPusher, TelegramConfig } from "./telegram";

// 加载环境变量
dotenv.config();

interface PatchOnceConfig {
  telegramBotToken: string;
  telegramChatId: string;
  publisher: string;
  extension: string;
  workDir: string;
}

class PatchOnceProcessor {
  private config: PatchOnceConfig;
  private telegramPusher: TelegramPusher | null = null;

  constructor() {
    this.config = this.loadConfig();

    const { telegramBotToken, telegramChatId } = this.config;
    if (telegramBotToken && telegramChatId && telegramBotToken !== 'your_bot_token_here' && telegramChatId !== 'your_chat_id_here') {
      const telegramConfig: TelegramConfig = {
        botToken: telegramBotToken,
        chatId: telegramChatId
      };
      this.telegramPusher = new TelegramPusher(telegramConfig);
    } else {
      console.log('ℹ️ 未配置 Telegram，将跳过推送功能');
    }
  }

  private loadConfig(): PatchOnceConfig {
    return {
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      publisher: process.env.PUBLISHER || "augment",
      extension: process.env.EXTENSION || "vscode-augment",
      workDir: process.env.WORK_DIR || "./augment-plugins"
    };
  }

  /**
   * 处理指定版本
   */
  async processVersion(version: string): Promise<boolean> {
    try {
      console.log(`🔧 开始处理指定版本: ${version}...`);

      // 验证版本号格式
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`无效的版本号格式: ${version}，请使用 x.x.x 格式（如 0.688.0）`);
      }

      // 调用patch函数处理指定版本
      const patchedFilePath = await patchExtension(version, true);
      
      if (!patchedFilePath) {
        throw new Error("Patch处理失败");
      }

      console.log(`✅ Patch完成: ${patchedFilePath}`);

      // 推送文件到Telegram（可选）
      if (this.telegramPusher) {
        const pushMessage = {
          version: version,
          filePath: patchedFilePath,
          pushTime: new Date().toLocaleString('zh-CN'),
          changelog: "手动指定版本处理"
        };

        console.log(`📤 正在推送到Telegram...`);
        const pushSuccess = await this.telegramPusher.pushFile(pushMessage);

        if (pushSuccess) {
          console.log(`✅ 版本 ${version} 处理完成并推送成功`);
        } else {
          console.warn(`⚠️ 推送到Telegram失败，但Patch已完成: ${patchedFilePath}`);
        }
      } else {
        console.log(`✅ 版本 ${version} 处理完成 (未配置Telegram，跳过推送)`);
      }

      return true;

    } catch (error) {
      console.error(`❌ 处理版本 ${version} 时出错:`, error);
      if (this.telegramPusher) {
        await this.telegramPusher.sendErrorNotification(
          error instanceof Error ? error.message : String(error),
          version
        );
      }
      return false;
    }
  }

  /**
   * 获取并处理最新版本（一次性）
   */
  async processLatestVersion(): Promise<boolean> {
    try {
      console.log(`🔍 获取 ${this.config.publisher}.${this.config.extension} 的最新版本...`);
      
      const versions = await getExtensionVersions(
        this.config.publisher,
        this.config.extension,
        1
      );

      if (versions.length === 0) {
        console.log("❌ 无法获取版本信息");
        return false;
      }

      const latestVersion = versions[0].version;
      console.log(`📦 最新版本: ${latestVersion}`);

      return await this.processVersion(latestVersion);

    } catch (error) {
      console.error("❌ 获取最新版本时出错:", error);
      return false;
    }
  }

  /**
   * 测试Telegram连接
   */
  async testConnection(): Promise<boolean> {
    if (!this.telegramPusher) {
      return true; // 未配置时视为成功
    }
    return await this.telegramPusher.testConnection();
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("用法:");
    console.log("  处理指定版本: npx tsx patch-once.ts <version>");
    console.log("  处理最新版本: npx tsx patch-once.ts --latest");
    console.log("");
    console.log("示例:");
    console.log("  npx tsx patch-once.ts 0.688.0");
    console.log("  npx tsx patch-once.ts --latest");
    process.exit(1);
  }

  try {
    const processor = new PatchOnceProcessor();

    // 测试Telegram连接（可选）
    const telegramOk = await processor.testConnection();
    if (!telegramOk) {
      console.warn('⚠️ Telegram机器人连接失败，将跳过推送功能');
    }

    let success = false;

    if (args[0] === "--latest") {
      // 获取并处理最新版本
      success = await processor.processLatestVersion();
    } else {
      // 处理指定版本
      const version = args[0];
      success = await processor.processVersion(version);
    }

    if (success) {
      console.log("🎉 处理完成！");
      process.exit(0);
    } else {
      console.log("❌ 处理失败");
      process.exit(1);
    }
    
  } catch (error) {
    console.error("❌ 执行失败:", error);
    process.exit(1);
  }
}

main();
