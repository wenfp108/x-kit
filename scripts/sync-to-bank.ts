import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
  const [y, m, d] = today.split('-');
  const hierDir = path.join(BANK_TARGET_DIR, y, m, d);

  console.log(`🚀 Sync Target: Central-Bank/twitter/${y}/${m}/${d}/`);
  console.log(`📅 Date: ${today}`);

  if (!fs.existsSync(BANK_ROOT)) {
    console.error("❌ Critical: 'central_bank' directory not found!");
    process.exit(1);
  }

  if (!fs.existsSync(hierDir)) {
    fs.mkdirSync(hierDir, { recursive: true });
  }

  if (fs.existsSync(TWEETS_DIR)) {
    const files = fs.readdirSync(TWEETS_DIR);
    let syncCount = 0;

    files.forEach(file => {
      if (!file.endsWith('.json')) return;
      if (!file.includes(today)) return;

      const src = path.join(TWEETS_DIR, file);
      const dest = path.join(hierDir, file);

      try {
        if (fs.existsSync(dest)) {
          if (fileHash(src) === fileHash(dest)) return;
        }

        fs.copyFileSync(src, dest);
        console.log(`✅ [Synced] ${file} -> twitter/${y}/${m}/${d}/`);
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
