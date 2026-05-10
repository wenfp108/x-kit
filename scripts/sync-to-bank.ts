import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 1. 定义路径
const ROOT = process.cwd();
const TWEETS_DIR = path.resolve(ROOT, 'tweets');
const BANK_ROOT = path.resolve(ROOT, '../central_bank');
const BANK_TARGET_DIR = path.join(BANK_ROOT, 'twitter');

function fileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

async function syncLogic() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`🚀 Sync Target: Central-Bank/twitter/`);
  console.log(`📅 Date: ${today}`);

  if (!fs.existsSync(BANK_ROOT)) {
    console.error("❌ Critical: 'central_bank' directory not found!");
    process.exit(1);
  }

  if (!fs.existsSync(BANK_TARGET_DIR)) {
    fs.mkdirSync(BANK_TARGET_DIR, { recursive: true });
  }

  if (fs.existsSync(TWEETS_DIR)) {
    const files = fs.readdirSync(TWEETS_DIR);
    let syncCount = 0;

    files.forEach(file => {
      if (!file.endsWith('.json')) return;

      const src = path.join(TWEETS_DIR, file);
      const dest = path.join(BANK_TARGET_DIR, file);

      try {
        // 只同步今天的文件（其他文件由历史数据管理）
        if (!file.includes(today)) return;

        // 内容对比：目标文件不存在或内容不同才复制
        if (fs.existsSync(dest)) {
          if (fileHash(src) === fileHash(dest)) {
            return; // 内容相同，跳过
          }
        }

        fs.copyFileSync(src, dest);
        console.log(`✅ [Synced] ${file} -> /twitter/`);
        syncCount++;
      } catch (e) {
        console.error(`❌ Error syncing ${file}:`, e);
      }
    });

    if (syncCount === 0) {
      console.log("⚠️ No new data to sync.");
    } else {
      console.log(`🎉 Sync complete. Updated ${syncCount} file(s).`);
    }
  } else {
    console.log("📭 tweets dir is empty.");
  }
}

syncLogic().catch(console.error);
