import axios from "axios";
import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import UglifyJS from "uglify-js";

// 下载链接示例: https://marketplace.visualstudio.com/_apis/public/gallery/publishers/augment/vsextensions/vscode-augment/0.412.0/vspackage

const patchJs = (fileContent: string) => {
  const loginPrefix = "async login";
  const injectContent = fs.readFileSync("./inject.txt", "utf-8");

  // 首先进行文本替换：将 this._disable=.*? 替换为 this._disable=1
  const disablePattern = /this\._disable=.*?([,;])/g;
  let modifiedContent = fileContent.replace(disablePattern, 'this._disable=1$1');

  // 检查是否成功进行了替换
  const disableMatches = fileContent.match(disablePattern);
  if (disableMatches && disableMatches.length > 0) {
    console.log(`成功替换 ${disableMatches.length} 个 this._disable 属性为固定值 1`);
  } else {
    console.log("未找到 this._disable 属性，跳过替换");
  }

  // 添加OAuth错误替换：将 throw new Error("OAuth request failed: invalid OAuth tenant URL") 替换为 {}
  const oauthErrorPattern = /throw new Error\("OAuth request failed: invalid OAuth tenant URL"\)/g;
  modifiedContent = modifiedContent.replace(oauthErrorPattern, '{}');

  // 检查是否成功进行了OAuth错误替换
  const oauthMatches = fileContent.match(oauthErrorPattern);
  if (oauthMatches && oauthMatches.length > 0) {
    console.log(`成功替换 ${oauthMatches.length} 个 OAuth 错误抛出为空对象`);
  } else {
    console.log("未找到 OAuth 错误抛出，跳过替换");
  }
  
  const index = modifiedContent.indexOf(loginPrefix);
  if (index === -1) {
    throw new Error("注入失败，没有找到登录函数！");
  }

  // 找到函数开始的花括号位置
  const braceIndex = modifiedContent.indexOf("{", index);
  if (braceIndex === -1) {
    throw new Error("注入失败，没有找到函数体！");
  }

  let newContent =
    modifiedContent.substring(0, braceIndex + 1) +
    injectContent +
    modifiedContent.substring(braceIndex + 1);

  return newContent;
};

interface ExtensionVersion {
  version: string;
  lastUpdated: string;
}

export async function getExtensionVersions(
  publisher: string,
  extension: string,
  count: number = 10
): Promise<ExtensionVersion[]> {
  try {
    const response = await axios.post(
      "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
      {
        filters: [
          {
            criteria: [
              { filterType: 7, value: `${publisher}.${extension}` },
            ],
          },
        ],
        flags: 2,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json;api-version=3.0-preview.1",
        },
      }
    );

    const results = response.data.results;
    if (!results || results.length === 0) {
      console.log("未找到扩展");
      return [];
    }

    const extensions = results[0].extensions;
    if (!extensions || extensions.length === 0) {
      console.log("未找到扩展数据");
      return [];
    }

    const versions = extensions[0].versions;
    if (!versions || versions.length === 0) {
      console.log("未找到版本数据");
      return [];
    }

    // 提取版本信息
    return versions.slice(0, count).map((v: any) => ({
      version: v.version,
      lastUpdated: v.lastUpdated,
    }));
  } catch (error) {
    console.error("获取扩展版本信息时出错:", error);
    return [];
  }
}

// 检查是否已存在修补过的文件
const checkExistingPatchedFile = (version: string): string | null => {
  const tempDir = path.resolve(process.cwd(), "augment-plugins");
  if (!fs.existsSync(tempDir)) {
    return null;
  }

  const patchedFilePath = path.join(
    tempDir,
    `augment.vscode-augment-${version}-patched.vsix`
  );
  if (fs.existsSync(patchedFilePath)) {
    return patchedFilePath;
  }

  return null;
};

// 清理旧版本，只保留最新的5个版本
const cleanOldVersions = (currentVersion: string) => {
  try {
    const tempDir = path.resolve(process.cwd(), "augment-plugins");
    if (!fs.existsSync(tempDir)) {
      return;
    }

    // 获取所有修补过的文件
    const files = fs
      .readdirSync(tempDir)
      .filter(
        (file) =>
          file.startsWith("augment.vscode-augment-") &&
          file.endsWith("-patched.vsix")
      );

    // 排除当前版本
    const otherVersions = files.filter(
      (file) => !file.includes(`-${currentVersion}-`)
    );

    // 按版本号排序（提取版本号并按版本号排序）
    const sortedVersions = otherVersions.sort((a, b) => {
      const versionA =
        a.match(/augment\.vscode-augment-(\d+\.\d+\.\d+)-patched\.vsix/)?.[1] ||
        "";
      const versionB =
        b.match(/augment\.vscode-augment-(\d+\.\d+\.\d+)-patched\.vsix/)?.[1] ||
        "";

      // 按版本号分量比较
      const partsA = versionA.split(".").map(Number);
      const partsB = versionB.split(".").map(Number);

      for (let i = 0; i < 3; i++) {
        if (partsA[i] !== partsB[i]) {
          return partsB[i] - partsA[i]; // 降序排列，最新的在前面
        }
      }

      return 0;
    });

    // 如果有超过4个其他版本（加上当前版本就是5个），删除旧版本
    if (sortedVersions.length > 4) {
      const versionsToDelete = sortedVersions.slice(4);
      for (const versionFile of versionsToDelete) {
        const filePath = path.join(tempDir, versionFile);
        fs.unlinkSync(filePath);
        console.log(`已删除旧版本: ${filePath}`);
      }
    }
  } catch (error) {
    console.error("清理旧版本时出错:", error);
  }
};

export const patchExtension = async (version: string, cleanUp: boolean = true) => {
  let tempDir = "";
  let extractDir = "";
  let vsixPath = "";
  let patchedVsixPath = "";

  try {
    // 检查是否已存在修补过的文件
    const existingPatchedFile = checkExistingPatchedFile(version);
    if (existingPatchedFile) {
      console.log(`已存在修补过的文件: ${existingPatchedFile}`);
      // 清理旧版本
      cleanOldVersions(version);
      return existingPatchedFile;
    }

    console.log(`开始下载 augment.vscode-augment ${version} 版本...`);

    // 创建临时目录
    tempDir = path.resolve(process.cwd(), "augment-plugins");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 下载扩展文件
    const url = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/augment/vsextensions/vscode-augment/${version}/vspackage`;
    vsixPath = path.join(tempDir, `augment.vscode-augment-${version}.vsix`);

    // 使用流式下载以处理大文件
    const response = await axios.get(url, { responseType: "stream" });
    await pipeline(response.data, fs.createWriteStream(vsixPath));
    console.log(`扩展下载完成: ${vsixPath}`);

    // 解压扩展
    extractDir = path.join(tempDir, `augment.vscode-augment-${version}`);
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });

    const zip = new AdmZip(vsixPath);
    zip.extractAllTo(extractDir, true);
    console.log(`扩展解压完成: ${extractDir}`);

    // 找到并修改extension.js文件
    const extensionJsPath = path.join(extractDir, "extension/out/extension.js");
    if (!fs.existsSync(extensionJsPath)) {
      throw new Error(`未找到extension.js文件: ${extensionJsPath}`);
    }

    const packageJsonPath = path.join(extractDir, "extension/package.json");
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error(`未找到package.json文件: ${packageJsonPath}`);
    }

    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);
    packageJson.displayName = packageJson.displayName + "网关版";
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2),
      "utf-8"
    );

    // 读取文件内容
    const fileContent = fs.readFileSync(extensionJsPath, "utf-8");

    // 使用patchJs函数修改内容
    const patchedContent = patchJs(fileContent);

    const result = UglifyJS.minify(patchedContent, { warnings: false });

    // 写入修改后的内容
    fs.writeFileSync(extensionJsPath, result.code, "utf-8");
    console.log(`扩展文件修改完成`);

    const iconPath = "./public/icon.png";
    fs.copyFileSync(iconPath, path.join(extractDir, "extension/icon.png"));

    // 重新打包扩展
    const patchedZip = new AdmZip();

    // 添加所有文件到新的zip
    const addFilesToZip = (dir: string, zipBaseDir: string = "") => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const zipPath = path.join(zipBaseDir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          addFilesToZip(filePath, zipPath);
        } else {
          patchedZip.addLocalFile(filePath, path.dirname(zipPath));
        }
      }
    };

    addFilesToZip(extractDir);

    // 保存修改后的扩展
    patchedVsixPath = path.join(
      tempDir,
      `augment.vscode-augment-${version}-gateway-patched.vsix`
    );
    patchedZip.writeZip(patchedVsixPath);

    console.log(`修补后的扩展已保存: ${patchedVsixPath}`);

    // 清理临时文件
    if (cleanUp) {
      cleanTempFiles(vsixPath, extractDir);
    }

    // 清理旧版本
    cleanOldVersions(version);

    return patchedVsixPath;
  } catch (error) {
    console.error("修补扩展时出错:", error);

    // 发生错误时也清理临时文件
    if (cleanUp && vsixPath && extractDir) {
      cleanTempFiles(vsixPath, extractDir);
    }

    throw error;
  }
};

// 清理临时文件和目录
const cleanTempFiles = (vsixPath: string, extractDir: string) => {
  try {
    // 删除原始的vsix文件
    if (fs.existsSync(vsixPath)) {
      fs.unlinkSync(vsixPath);
      console.log(`已删除原始扩展文件: ${vsixPath}`);
    }

    // 删除解压目录
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
      console.log(`已删除解压目录: ${extractDir}`);
    }
  } catch (error) {
    console.error("清理临时文件时出错:", error);
  }
};

// 主函数
export async function updateAugment(count: number = 1) {
  const publisher = "augment";
  const extension = "vscode-augment";
  // 默认清理临时文件
  const cleanUp = true;

  try {
    // 获取最新版本
    console.log(`获取 ${publisher}.${extension} 的最新版本信息...`);
    const versions = await getExtensionVersions(publisher, extension, count);

    if (versions.length === 0) {
      console.error("无法获取扩展版本信息");
      return;
    }

    for (const version of versions) {
      const latestVersion = version.version;
      console.log(
        `最新版本: ${latestVersion}, 发布日期: ${new Date(version.lastUpdated).toLocaleDateString("zh-CN")}`
      );

      // 修补扩展
      const patchedPath = await patchExtension(latestVersion, cleanUp);
      console.log(`成功修补扩展: ${patchedPath}`);
      console.log(
        `使用方法: 将修补后的扩展文件重命名为 .vsix 后缀，然后在 VSCode 中从 VSIX 安装即可。`
      );
    }
  } catch (error) {
    console.error("执行脚本时出错:", error);
  }
}
