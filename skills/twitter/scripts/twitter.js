#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ENV_PATH = path.join(os.homedir(), '.config', 'last30days', '.env');
const CLIENT_LIB_PATH = '/home/alyosha/projects/last30days-skill-audit/vendor/package/dist/lib/twitter-client.js';
const WRITE_COMMANDS = new Set([
  'post',
  'reply',
  'like',
  'unlike',
  'retweet',
  'unretweet',
  'bookmark',
  'unbookmark',
  'follow',
  'unfollow',
]);

function usage() {
  const lines = [
    'Usage:',
    '  twitter.js whoami',
    '  twitter.js search <query> [--count N]',
    '  twitter.js user <handle> [--count N]',
    '  twitter.js read <tweet-id-or-url>',
    '  twitter.js thread <tweet-id-or-url>',
    '  twitter.js post <text> --yes',
    '  twitter.js reply <tweet-id-or-url> <text> --yes',
    '  twitter.js like|unlike|retweet|unretweet|bookmark|unbookmark <tweet-id-or-url> --yes',
    '  twitter.js follow|unfollow <handle-or-user-id> --yes',
  ];
  fail(lines.join('\n'), 2);
}

function fail(message, exitCode = 1, extra = {}) {
  console.error(JSON.stringify({ success: false, error: message, ...extra }, null, 2));
  process.exit(exitCode);
}

function ok(data) {
  console.log(JSON.stringify({ success: true, ...data }, null, 2));
}

function parseEnvFile(text) {
  const vars = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const clean = line.startsWith('export ') ? line.slice(7) : line;
    const index = clean.indexOf('=');
    if (index <= 0) {
      continue;
    }
    const key = clean.slice(0, index).trim();
    let value = clean.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function loadCredentials() {
  const envVars = {};
  if (fs.existsSync(ENV_PATH)) {
    Object.assign(envVars, parseEnvFile(fs.readFileSync(ENV_PATH, 'utf8')));
  }
  const authToken = process.env.AUTH_TOKEN || process.env.TWITTER_AUTH_TOKEN || envVars.AUTH_TOKEN || envVars.TWITTER_AUTH_TOKEN;
  const ct0 = process.env.CT0 || process.env.TWITTER_CT0 || envVars.CT0 || envVars.TWITTER_CT0;
  if (!authToken || !ct0) {
    fail(`Missing AUTH_TOKEN or CT0. Expected them in ${ENV_PATH} or the current environment.`);
  }
  return {
    authToken,
    ct0,
    cookieHeader: `auth_token=${authToken}; ct0=${ct0}`,
  };
}

async function loadTwitterClientClass() {
  if (!fs.existsSync(CLIENT_LIB_PATH)) {
    fail(`Twitter client library not found at ${CLIENT_LIB_PATH}`);
  }
  const mod = await import(pathToFileURL(CLIENT_LIB_PATH).href);
  if (!mod.TwitterClient) {
    fail(`Twitter client library at ${CLIENT_LIB_PATH} does not export TwitterClient`);
  }
  return mod.TwitterClient;
}

async function createClient() {
  const TwitterClient = await loadTwitterClientClass();
  return new TwitterClient({
    cookies: loadCredentials(),
    timeoutMs: 20_000,
    quoteDepth: 1,
  });
}

function consumeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return false;
  }
  args.splice(index, 1);
  return true;
}

function consumeOption(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  if (index === args.length - 1) {
    fail(`Missing value for ${flag}`);
  }
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function parseCount(rawValue, fallback) {
  if (rawValue == null) {
    return fallback;
  }
  const count = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(count) || count <= 0) {
    fail(`Invalid --count value: ${rawValue}`);
  }
  return count;
}

function extractTweetId(ref) {
  if (!ref) {
    fail('Missing tweet id or URL');
  }
  const trimmed = ref.trim();
  const match = trimmed.match(/status\/(\d+)/i);
  if (match) {
    return match[1];
  }
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  fail(`Could not extract tweet id from: ${ref}`);
}

function extractHandle(ref) {
  if (!ref) {
    fail('Missing handle or user id');
  }
  const trimmed = ref.trim();
  if (/^\d+$/.test(trimmed)) {
    return null;
  }
  const urlMatch = trimmed.match(/x\.com\/([^/?#]+)/i) || trimmed.match(/twitter\.com\/([^/?#]+)/i);
  if (urlMatch) {
    return urlMatch[1].replace(/^@+/, '');
  }
  return trimmed.replace(/^@+/, '');
}

function tweetUrl(tweet) {
  const username = tweet?.author?.username;
  const id = tweet?.id;
  if (!username || !id) {
    return null;
  }
  return `https://x.com/${username}/status/${id}`;
}

function mapTweet(tweet) {
  return {
    id: tweet.id,
    url: tweetUrl(tweet),
    text: tweet.text,
    createdAt: tweet.createdAt,
    author: tweet.author,
    authorId: tweet.authorId,
    replyCount: tweet.replyCount,
    retweetCount: tweet.retweetCount,
    likeCount: tweet.likeCount,
    conversationId: tweet.conversationId,
    inReplyToStatusId: tweet.inReplyToStatusId,
  };
}

async function resolveUser(client, ref) {
  if (/^\d+$/.test(ref.trim())) {
    return { success: true, userId: ref.trim(), username: null, name: null };
  }
  const handle = extractHandle(ref);
  const lookup = await client.getUserIdByUsername(handle);
  if (!lookup.success || !lookup.userId) {
    fail(lookup.error || `Could not resolve user: ${ref}`);
  }
  return lookup;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    usage();
  }

  const command = args.shift();
  const confirmed = consumeFlag(args, '--yes');
  const count = parseCount(consumeOption(args, '--count'), 5);

  if (WRITE_COMMANDS.has(command) && !confirmed) {
    fail(`Refusing ${command} without explicit confirmation. Re-run with --yes after user approval.`);
  }

  const client = await createClient();

  if (command === 'whoami') {
    const result = await client.getCurrentUser();
    if (!result.success) {
      fail(result.error || 'Failed to get current user');
    }
    ok({ user: result.user });
    return;
  }

  if (command === 'search') {
    if (args.length === 0) {
      usage();
    }
    const query = args.join(' ');
    const result = await client.search(query, count);
    if (!result.success) {
      fail(result.error || 'Search failed');
    }
    ok({ query, tweets: result.tweets.map(mapTweet) });
    return;
  }

  if (command === 'user') {
    if (args.length !== 1) {
      usage();
    }
    const lookup = await resolveUser(client, args[0]);
    const result = await client.getUserTweets(lookup.userId, count);
    if (!result.success) {
      fail(result.error || 'Failed to fetch user timeline');
    }
    ok({
      user: {
        id: lookup.userId,
        username: lookup.username,
        name: lookup.name,
      },
      tweets: result.tweets.map(mapTweet),
    });
    return;
  }

  if (command === 'read') {
    if (args.length !== 1) {
      usage();
    }
    const tweetId = extractTweetId(args[0]);
    const result = await client.getTweet(tweetId);
    if (!result.success || !result.tweet) {
      fail(result.error || `Failed to read tweet ${tweetId}`);
    }
    ok({ tweet: mapTweet(result.tweet) });
    return;
  }

  if (command === 'thread') {
    if (args.length !== 1) {
      usage();
    }
    const tweetId = extractTweetId(args[0]);
    const result = await client.getThread(tweetId);
    if (!result.success) {
      fail(result.error || `Failed to read thread ${tweetId}`);
    }
    ok({ tweetId, tweets: result.tweets.map(mapTweet) });
    return;
  }

  if (command === 'post') {
    if (args.length === 0) {
      usage();
    }
    const text = args.join(' ');
    const result = await client.tweet(text);
    if (!result.success || !result.tweetId) {
      fail(result.error || 'Failed to post tweet');
    }
    ok({ action: 'post', tweetId: result.tweetId, url: `https://x.com/i/web/status/${result.tweetId}` });
    return;
  }

  if (command === 'reply') {
    if (args.length < 2) {
      usage();
    }
    const tweetId = extractTweetId(args.shift());
    const text = args.join(' ');
    const result = await client.reply(text, tweetId);
    if (!result.success || !result.tweetId) {
      fail(result.error || `Failed to reply to ${tweetId}`);
    }
    ok({ action: 'reply', inReplyTo: tweetId, tweetId: result.tweetId, url: `https://x.com/i/web/status/${result.tweetId}` });
    return;
  }

  if (['like', 'unlike', 'retweet', 'unretweet', 'bookmark', 'unbookmark'].includes(command)) {
    if (args.length !== 1) {
      usage();
    }
    const tweetId = extractTweetId(args[0]);
    const result = await client[command](tweetId);
    if (!result.success) {
      fail(result.error || `Failed to ${command} ${tweetId}`);
    }
    ok({ action: command, tweetId });
    return;
  }

  if (command === 'follow' || command === 'unfollow') {
    if (args.length !== 1) {
      usage();
    }
    const lookup = await resolveUser(client, args[0]);
    const result = await client[command](lookup.userId);
    if (!result.success) {
      fail(result.error || `Failed to ${command} ${args[0]}`);
    }
    ok({
      action: command,
      user: {
        id: lookup.userId,
        username: result.username || lookup.username,
        name: lookup.name,
      },
    });
    return;
  }

  usage();
}

await main();
