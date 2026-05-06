import accounts from "../dev-accounts.json" with { type: "json" };
import { xGuestClient, withRetry } from "./utils.ts";
import {get} from 'lodash';
import fs from 'fs-extra';

interface Account {
  id?: string;
  "username": string;
  "twitter_url": string;
  "description": string;
  "tags": string[];
}

const appendedAccounts: Account[] = [];
for (const account of accounts) {
  if (fs.existsSync(`./accounts/${account.username}.json`)) {
    console.log(`${account.username} already exists`);
    continue;
  }

  const client = await xGuestClient();
  let user: any = {};
  try {
    user = await withRetry(
      () => client.getUserApi().getUserByScreenName({screenName: account.username}),
      3,
      `@${account.username} profile`
    );
    const userData = get(user, 'data.user', {});
    if (Object.keys(userData).length > 0) {
      fs.writeFileSync(`./accounts/${account.username}.json`, JSON.stringify(userData, null, 2));
      console.log(`${account.username} saved`);
    } else {
      console.log(`${account.username} data is empty`);
    }
  } catch (error) {
    console.error(`Error fetching ${account.username}:`, error);
  }
}

