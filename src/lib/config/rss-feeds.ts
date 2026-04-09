import type { TradingViewRssNewsFeedInfo, TradingViewRssNewsFeedParams } from '@/lib/types'

export type RssNewsTier = 1 | 2 | 3

export const CRYPTO_RSS_NEWS_FEEDS_TIER_1: TradingViewRssNewsFeedInfo[] = [
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed' },
  { name: 'Glassnode Insights', url: 'https://insights.glassnode.com/rss' },
  { name: 'Chainalysis Blog', url: 'https://chainalysis.com/blog/feed' },
  { name: 'The Defiant', url: 'https://thedefiant.io/api/feed' },
]

export const CRYPTO_RSS_NEWS_FEEDS_TIER_2: TradingViewRssNewsFeedInfo[] = [
  { name: 'NewsBTC', url: 'https://newsbtc.com/feed' },
  { name: 'BeInCrypto', url: 'https://beincrypto.com/feed' },
  { name: 'CryptoSlate', url: 'https://cryptoslate.com/feed' },
  { name: 'U.Today', url: 'https://u.today/rss' },
  { name: 'Bitcoinist', url: 'https://bitcoinist.com/feed' },
  { name: 'CryptoPanic', url: 'https://cryptopanic.com/news/rss' },
  { name: 'Investing.com Crypto', url: 'https://investing.com/rss/news_301.rss' },
]

export const CRYPTO_RSS_NEWS_FEEDS_TIER_3: TradingViewRssNewsFeedInfo[] = [
  { name: 'Finance Magnates Crypto', url: 'https://financemagnates.com/cryptocurrency/feed' },
  { name: 'Bitcoin.com News', url: 'https://news.bitcoin.com/feed' },
  { name: 'CoinSpeaker', url: 'https://coinspeaker.com/feed' },
  { name: 'AMBCrypto', url: 'https://ambcrypto.com/feed' },
  { name: '99Bitcoins', url: 'https://99bitcoins.com/feed' },
]

export const CRYPTO_RSS_NEWS_FEEDS: TradingViewRssNewsFeedInfo[] = [
  ...CRYPTO_RSS_NEWS_FEEDS_TIER_1,
  ...CRYPTO_RSS_NEWS_FEEDS_TIER_2,
  ...CRYPTO_RSS_NEWS_FEEDS_TIER_3,
]

function toTierMap(
  feeds: TradingViewRssNewsFeedInfo[],
  tier: RssNewsTier
): Record<string, RssNewsTier> {
  const output: Record<string, RssNewsTier> = {}

  for (const feed of feeds) {
    output[feed.name] = tier
  }

  return output
}

export const CRYPTO_RSS_NEWS_SOURCE_TIERS: Record<string, RssNewsTier> = {
  ...toTierMap(CRYPTO_RSS_NEWS_FEEDS_TIER_1, 1),
  ...toTierMap(CRYPTO_RSS_NEWS_FEEDS_TIER_2, 2),
  ...toTierMap(CRYPTO_RSS_NEWS_FEEDS_TIER_3, 3),
}

export function buildTradingViewRssNewsFeedParams(): TradingViewRssNewsFeedParams {
  return {
    default: CRYPTO_RSS_NEWS_FEEDS,
    crypto: CRYPTO_RSS_NEWS_FEEDS,
  }
}
