import cron from "node-cron";
import dotenv from "dotenv";
import { updateAugment, patchExtension, getExtensionVersions } from "./augmentExt";
import { VersionTracker, VersionInfo } from "./version-tracker";
import { TelegramPusher, TelegramConfig } from "./telegram";

// 加载环境变量
dotenv.config();

interface Config {
  telegramBotToken: string;
  telegramChatId: string;
  checkIntervalMinutes: number;
  publisher: string;
  extension: string;
  workDir: string;
  autoCleanup: boolean;
  keepVersions: number;
  logLevel: string;
}

class AugmentScheduler {
  private config: Config;
  private versionTracker: VersionTracker;
  private telegramPusher: TelegramPusher;
  private isProcessing: boolean = false;

  constructor() {
    this.config = this.loadConfig();
    this.versionTracker = new VersionTracker(this.config.workDir);
    
    const telegramConfig: TelegramConfig = {
      botToken: this.config.telegramBotToken,
      chatId: this.config.telegramChatId
    };
    this.telegramPusher = new TelegramPusher(telegramConfig);
  }

  /**
   * 加载配置
   */
  private loadConfig(): Config {
    const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`缺少必需的环境变量: ${envVar}`);
      }
    }

    return {
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN!,
      telegramChatId: process.env.TELEGRAM_CHAT_ID!,
      checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES || "60"),
      publisher: process.env.PUBLISHER || "augment",
      extension: process.env.EXTENSION || "vscode-augment",
      workDir: process.env.WORK_DIR || "./augment-plugins",
      autoCleanup: process.env.AUTO_CLEANUP === "true",
      keepVersions: parseInt(process.env.KEEP_VERSIONS || "1"),
      logLevel: process.env.LOG_LEVEL || "info"
    };
  }

  /**
   * 启动调度器
   */
  async start() {
    console.log("🚀 Augment Patch 调度器启动中...");

    // 测试Telegram连接
    const telegramOk = await this.telegramPusher.testConnection();
    if (!telegramOk) {
      throw new Error("Telegram机器人连接失败，请检查配置");
    }

    // 立即执行一次检查
    console.log("📋 执行初始检查...");
    await this.checkAndProcess();

    // 设置定时任务
    const cronExpression = `*/${this.config.checkIntervalMinutes} * * * *`;
    console.log(`⏰ 设置定时任务: ${cronExpression}`);
    
    cron.schedule(cronExpression, async () => {
      await this.checkAndProcess();
    });

    console.log("✅ 调度器启动完成，开始监控...");
  }

  /**
   * 检查并处理新版本
   */
  private async checkAndProcess() {
    if (this.isProcessing) {
      console.log("⏳ 正在处理中，跳过本次检查");
      return;
    }

    this.isProcessing = true;
    
    try {
      console.log(`🔍 检查 ${this.config.publisher}.${this.config.extension} 的更新...`);
      
      // 获取最新版本信息
      const versions = await getExtensionVersions(
        this.config.publisher,
        this.config.extension,
        1
      );

      if (versions.length === 0) {
        console.log("❌ 无法获取版本信息");
        return;
      }

      const latestVersion = versions[0];
      console.log(`📦 最新版本: ${latestVersion.version}`);

      // 添加到版本跟踪
      this.versionTracker.addVersion(latestVersion);

      // 检查是否需要处理
      if (!this.versionTracker.hasNewVersionToProcess(latestVersion)) {
        console.log("✅ 已是最新版本，无需处理");
        return;
      }

      console.log(`🆕 发现新版本: ${latestVersion.version}，开始处理...`);

      // 处理新版本
      await this.processNewVersion(latestVersion);

    } catch (error) {
      console.error("❌ 检查更新时出错:", error);
      await this.telegramPusher.sendErrorNotification(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 处理新版本
   */
  private async processNewVersion(versionInfo: VersionInfo) {
    try {
      console.log(`🔧 开始处理版本 ${versionInfo.version}...`);

      // 调用现有的patch函数
      const patchedFilePath = await this.patchExtension(versionInfo.version);
      
      if (!patchedFilePath) {
        throw new Error("Patch处理失败");
      }

      // 标记为已处理
      this.versionTracker.markVersionAsProcessed(versionInfo.version, patchedFilePath);

      // 推送文件到Telegram（包含完整信息）
      const pushMessage = {
        version: versionInfo.version,
        filePath: patchedFilePath,
        pushTime: new Date().toLocaleString('zh-CN'),
        changelog: "啥也没干"
      };

      const pushSuccess = await this.telegramPusher.pushFile(pushMessage);
      
      if (pushSuccess) {
        console.log(`✅ 版本 ${versionInfo.version} 处理完成并推送成功`);
      } else {
        throw new Error("推送到Telegram失败");
      }

      // 清理旧版本
      if (this.config.autoCleanup) {
        this.versionTracker.cleanupOldVersions(this.config.keepVersions);
      }

    } catch (error) {
      console.error(`❌ 处理版本 ${versionInfo.version} 时出错:`, error);
      await this.telegramPusher.sendErrorNotification(
        error instanceof Error ? error.message : String(error),
        versionInfo.version
      );
      throw error;
    }
  }

  /**
   * 包装现有的patch函数
   */
  private async patchExtension(version: string): Promise<string | null> {
    try {
      // 直接调用patchExtension函数处理指定版本
      const patchedPath = await patchExtension(version, true);

      return patchedPath;
    } catch (error) {
      console.error("Patch处理失败:", error);
      return null;
    }
  }

  /**
   * 停止调度器
   */
  stop() {
    console.log("🛑 调度器停止");
    process.exit(0);
  }
}

// 主函数
async function main() {
  try {
    const scheduler = new AugmentScheduler();
    
    // 处理退出信号
    process.on('SIGINT', () => {
      console.log('\n收到退出信号...');
      scheduler.stop();
    });

    process.on('SIGTERM', () => {
      console.log('\n收到终止信号...');
      scheduler.stop();
    });

    await scheduler.start();
    
  } catch (error) {
    console.error("❌ 启动失败:", error);
    process.exit(1);
  }
}

// 如果直接运行此文件，则启动调度器
if (require.main === module) {
  main();
}

export { AugmentScheduler };
