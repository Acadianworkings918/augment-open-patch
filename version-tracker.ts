import fs from "fs";
import path from "path";

export interface VersionInfo {
  version: string;
  lastUpdated: string;
  patchedAt?: string;
  filePath?: string;
}

export class VersionTracker {
  private versionFile: string;
  private currentVersionFile: string;
  private workDir: string;

  constructor(workDir: string = "./augment-plugins") {
    this.workDir = workDir;
    this.versionFile = path.join(workDir, "version-history.json");
    this.currentVersionFile = path.join(workDir, "current-version.json");
    this.ensureWorkDir();
  }

  private ensureWorkDir() {
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }
  }

  /**
   * 获取版本历史记录
   */
  getVersionHistory(): VersionInfo[] {
    try {
      if (!fs.existsSync(this.versionFile)) {
        return [];
      }
      const content = fs.readFileSync(this.versionFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("读取版本历史失败:", error);
      return [];
    }
  }

  /**
   * 保存版本历史记录
   */
  saveVersionHistory(versions: VersionInfo[]) {
    try {
      fs.writeFileSync(
        this.versionFile,
        JSON.stringify(versions, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error("保存版本历史失败:", error);
    }
  }

  /**
   * 获取当前本地保存的最新版本
   */
  getCurrentVersion(): VersionInfo | null {
    try {
      if (!fs.existsSync(this.currentVersionFile)) {
        return null;
      }
      const content = fs.readFileSync(this.currentVersionFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("读取当前版本失败:", error);
      return null;
    }
  }

  /**
   * 保存当前版本信息
   */
  saveCurrentVersion(versionInfo: VersionInfo) {
    try {
      fs.writeFileSync(
        this.currentVersionFile,
        JSON.stringify(versionInfo, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.error("保存当前版本失败:", error);
    }
  }

  /**
   * 获取最新已处理的版本
   */
  getLatestProcessedVersion(): VersionInfo | null {
    return this.getCurrentVersion();
  }

  /**
   * 添加新版本记录
   */
  addVersion(versionInfo: VersionInfo) {
    const history = this.getVersionHistory();
    
    // 检查是否已存在
    const existingIndex = history.findIndex(v => v.version === versionInfo.version);
    
    if (existingIndex >= 0) {
      // 更新现有记录
      history[existingIndex] = { ...history[existingIndex], ...versionInfo };
    } else {
      // 添加新记录
      history.push(versionInfo);
    }

    // 按版本号排序
    history.sort((a, b) => this.compareVersions(b.version, a.version));
    
    this.saveVersionHistory(history);
  }

  /**
   * 标记版本为已处理
   */
  markVersionAsProcessed(version: string, filePath: string) {
    const history = this.getVersionHistory();
    const versionIndex = history.findIndex(v => v.version === version);

    const versionInfo: VersionInfo = {
      version,
      lastUpdated: new Date().toISOString(),
      patchedAt: new Date().toISOString(),
      filePath
    };

    if (versionIndex >= 0) {
      history[versionIndex] = { ...history[versionIndex], ...versionInfo };
    } else {
      history.push(versionInfo);
    }

    this.saveVersionHistory(history);

    // 保存为当前版本
    this.saveCurrentVersion(versionInfo);

    // 删除旧版本文件
    this.deleteOldVersionFiles(version);
  }

  /**
   * 检查是否有新版本需要处理
   */
  hasNewVersionToProcess(latestVersion: VersionInfo): boolean {
    const currentVersion = this.getCurrentVersion();

    if (!currentVersion) {
      return true; // 没有处理过任何版本
    }

    return this.compareVersions(latestVersion.version, currentVersion.version) > 0;
  }

  /**
   * 比较版本号
   * @param version1 
   * @param version2 
   * @returns 1 if version1 > version2, -1 if version1 < version2, 0 if equal
   */
  private compareVersions(version1: string, version2: string): number {
    const parts1 = version1.split(".").map(Number);
    const parts2 = version2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }

    return 0;
  }

  /**
   * 删除旧版本文件（保留当前版本）
   */
  private deleteOldVersionFiles(currentVersion: string) {
    try {
      if (!fs.existsSync(this.workDir)) {
        return;
      }

      // 获取所有修补过的文件
      const files = fs
        .readdirSync(this.workDir)
        .filter(
          (file) =>
            file.startsWith("augment.vscode-augment-") &&
            file.endsWith("-patched.vsix")
        );

      // 删除非当前版本的文件
      for (const file of files) {
        if (!file.includes(`-${currentVersion}-`)) {
          const filePath = path.join(this.workDir, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ 已删除旧版本文件: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error("删除旧版本文件时出错:", error);
    }
  }

  /**
   * 清理旧版本文件（保留指定数量）
   */
  cleanupOldVersions(keepCount: number = 1) {
    try {
      const currentVersion = this.getCurrentVersion();
      if (currentVersion) {
        // 只保留当前版本，删除其他所有版本
        this.deleteOldVersionFiles(currentVersion.version);
      }
    } catch (error) {
      console.error("清理旧版本时出错:", error);
    }
  }
}
