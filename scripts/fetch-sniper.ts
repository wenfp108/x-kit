import { XAuthClient, withRetry } from "./utils";
import { get } from "lodash";
import dayjs from "dayjs";
import fs from "fs-extra";
import path from "path";

// ==========================================
// 🧠 策略配置中心 (Strategy Hub)
// ==========================================

const TAG_STRATEGIES: Record<string, number> = {
  "Noise": 1,
  "Meme": 2,
  "Crypto": 3,
  "Politics": 3,
  "Economy": 3,
  "General": 4,
  "Geopolitics": 5,
  "Finance": 5,
  "Tech": 5,
  "Science": 8
};

const getLimitByTags = (tags: string[] = []): number => {
  if (!tags || tags.length === 0) return TAG_STRATEGIES["General"];
  let minLimit = 99;
  let hasMatch = false;
  tags.forEach(tag => {
    const key = Object.keys(TAG_STRATEGIES).find(k => tag.includes(k));
    if (key) {
      const limit = TAG_STRATEGIES[key];
      if (limit < minLimit) minLimit = limit;
      hasMatch = true;
    }
  });
  return hasMatch ? minLimit : TAG_STRATEGIES["General"];
};

// ==========================================
// 🛠️ 基础工具函数
// ==========================================

const findRestId = (obj: any): string | undefined => {
  if (!obj || typeof obj !== 'object') return undefined;
  if (obj.restId) return obj.restId;
  if (obj.rest_id) return obj.rest_id;
  for (const k of Object.keys(obj)) {
    if (typeof obj[k] === 'object') {
      const found = findRestId(obj[k]);
      if (found) return found;
    }
  }
  return undefined;
};

const loadTargets = () => {
  const accountPath = path.join(process.cwd(), "dev-accounts.json");
  if (!fs.existsSync(accountPath)) return [];
  const accounts = fs.readJSONSync(accountPath);
  const targets: { screenName: string; restId: string; tags: string[] }[] = [];
  accounts.forEach((acc: any) => {
    if (!acc.twitter_url) return;
    const urlParts = acc.twitter_url.split('/');
    const screenName = urlParts[urlParts.length - 1].trim();
    const cachePath = path.join(process.cwd(), "accounts", `${screenName}.json`);
    if (fs.existsSync(cachePath)) {
      const cache = fs.readJSONSync(cachePath);
      const restId = findRestId(cache);
      if (restId) {
        targets.push({ screenName, restId, tags: acc.tags || [] });
      }
    }
  });
  return targets;
};

// ==========================================
// 🚀 主程序
// ==========================================

const targets = loadTargets();
if (targets.length === 0) {
  console.error("❌ No targets found.");
  process.exit(1);
}

const todayPath = `./tweets/${dayjs().format("YYYY-MM-DD")}.json`;
const yesterdayPath = `./tweets/${dayjs().subtract(1, 'day').format("YYYY-MM-DD")}.json`;

let historyMap = new Map();
const loadIntoMap = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    try {
      const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      rows.forEach((row: any) => historyMap.set(row.tweetUrl, row));
    } catch (e) {
      console.warn(`⚠️ Failed to load history from ${filePath}`);
    }
  }
};
loadIntoMap(yesterdayPath);
loadIntoMap(todayPath);

console.log(`🎯 狙击目标: ${targets.length} 人 (传播加权引擎启动)`);

const client = await XAuthClient();
const newRows: any[] = [];
const shuffledTargets = targets.sort(() => 0.5 - Math.random());
console.log(`🕒 预计耗时: ~${(shuffledTargets.length * 30 / 60).toFixed(1)} 分钟`);

for (const [index, target] of shuffledTargets.entries()) {
  const currentNum = index + 1;
  const limit = getLimitByTags(target.tags);
  console.log(`\n[${currentNum}/${shuffledTargets.length}] 📡 Fetching @${target.screenName} [Tags: ${target.tags.join(',') || 'General'} -> Limit: ${limit}]...`);
  
  try {
    const resp = await withRetry(
      () => client.getTweetApi().getUserTweets({
        userId: target.restId,
        count: 40,
        includePromotedContent: false
      }),
      3,
      `@${target.screenName} tweets`
    );

    const timeline = get(resp, "data.data", []);
    let userTweets = timeline.map((item: any) => {
       let tweetData = get(item, "content.itemContent.tweet_results.result") || item;
       if (!tweetData.legacy && item.tweet) tweetData = item.tweet;
       const legacy = tweetData.legacy;
       if (!legacy) return null;
       let userResult = get(tweetData, "core.user_results.result.legacy");
       if (!userResult && item.user && item.user.legacy) userResult = item.user.legacy;
       if (!userResult) return null;
       return { legacy, userResult };
    }).filter(Boolean);

    userTweets = userTweets.filter((t: any) => {
      const createdAt = t.legacy.created_at || t.legacy.createdAt;
      const tweetDate = dayjs(createdAt);
      const today = dayjs();
      return tweetDate.isSame(today, 'day') || tweetDate.isSame(today.subtract(1, 'day'), 'day');
    });

    // 综合评分逻辑
    userTweets.sort((a: any, b: any) => {
      const getScore = (item: any) => {
          const v = parseInt(item.legacy.views?.count || "0") || 0;
          const l = item.legacy.favorite_count || 0;
          const r = item.legacy.reply_count || 0;
          const bm = item.legacy.bookmark_count || 0;
          const rt = (item.legacy.retweet_count || 0) + (item.legacy.quote_count || 0);
          return v + (l * 5) + (r * 20) + (bm * 50) + (rt * 100);
      };
      return getScore(b) - getScore(a);
    });

    const finalPicks = userTweets.slice(0, limit);
    console.log(`   ✅ Kept Top ${finalPicks.length} tweets (Weighted).`);

    finalPicks.forEach((data: any) => {
      const { legacy, userResult } = data;
      const createdAt = legacy.created_at || legacy.createdAt; 
      const idStr = legacy.id_str || legacy.idStr;
      const tweetUrl = `https://x.com/${userResult.screenName || userResult.screen_name}/status/${idStr}`;
      
      const metrics = {
        likes: legacy.favorite_count || legacy.favoriteCount || 0,
        retweets: legacy.retweet_count || legacy.retweetCount || 0,
        replies: legacy.reply_count || legacy.replyCount || 0,
        quotes: legacy.quote_count || legacy.quoteCount || 0,
        bookmarks: legacy.bookmark_count || legacy.bookmarkCount || 0,
        views: parseInt(legacy.views?.count || "0") || 0
      };

      const oldTweet = historyMap.get(tweetUrl);
      let growth = { views: 0, likes: 0, retweets: 0, replies: 0 };

      if (oldTweet && oldTweet.metrics) {
        const oldMetrics = oldTweet.metrics;
        growth = {
            views: (metrics.views || 0) - (oldMetrics.views || 0),
            likes: (metrics.likes || 0) - (oldMetrics.likes || 0),
            retweets: (metrics.retweets || 0) - (oldMetrics.retweets || 0),
            replies: (metrics.replies || 0) - (oldMetrics.replies || 0)
        };
        Object.keys(growth).forEach(k => { if ((growth as any)[k] < 0) (growth as any)[k] = 0; });
      } else {
        growth = { views: metrics.views, likes: metrics.likes, retweets: metrics.retweets, replies: metrics.replies };
      }

      newRows.push({
        tags: target.tags, 
        user: {
            screenName: userResult.screenName || userResult.screen_name,
            name: userResult.name,
            followersCount: userResult.followersCount || userResult.followers_count,
        },
        images: (legacy.extended_entities?.media || []).map((m:any) => m.media_url_https),
        tweetUrl,
        fullText: legacy.full_text || legacy.fullText,
        createdAt,
        metrics,
        growth
      });
    });

  } catch (e) {
    console.error(`   ❌ Failed @${target.screenName}:`, e);
  }

  // 💾 Checkpoint 保存：包含格式化优化
  if (currentNum % 5 === 0 || currentNum === shuffledTargets.length) {
    try {
        const tempSortedRows = [...newRows].sort((a: any, b: any) => {
             const getScore = (row: any) => {
                const m = row.metrics;
                const rt = (m.retweets || 0) + (m.quotes || 0);
                return (m.views||0) + ((m.likes||0)*5) + ((m.replies||0)*20) + ((m.bookmarks||0)*50) + (rt*100);
             };
             return getScore(b) - getScore(a);
        });

        // 核心：单行格式化逻辑
        const jsonString = JSON.stringify(tempSortedRows, null, 2);
        const compactJson = jsonString
          .replace(/"user": \{\n\s+([^}]+)\n\s+\}/g, (match, content) => {
            return `"user": { ${content.replace(/\n\s+/g, ' ').trim()} }`;
          })
          .replace(/"tags": \[\n\s+([^\]]+)\n\s+\]/g, (match, content) => {
            return `"tags": [ ${content.replace(/\n\s+/g, ' ').trim()} ]`;
          })
          .replace(/"growth": \{\n\s+([^}]+)\n\s+\}/g, (match, content) => {
            return `"growth": { ${content.replace(/\n\s+/g, ' ').trim()} }`;
          });

        fs.writeFileSync(todayPath, compactJson);
        console.log(`💾 [Checkpoint] Saved ${newRows.length} tweets.`);
    } catch (err) {
      console.error("   ❌ Save failed:", err);
    }
  }

  if (currentNum < shuffledTargets.length) {
    const delay = Math.floor(Math.random() * (40000 - 20000 + 1)) + 20000;
    console.log(`   ☕ Resting ${Math.round(delay / 1000)}s...`);
    await new Promise(r => setTimeout(r, delay));
  }
}

console.log("🚀 Sniper mission complete.");
