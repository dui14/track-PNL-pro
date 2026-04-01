import type { TradingViewRssNewsFeedInfo, TradingViewRssNewsFeedParams } from '@/lib/types'

export const CRYPTO_RSS_NEWS_FEEDS: TradingViewRssNewsFeedInfo[] = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
]

export function buildTradingViewRssNewsFeedParams(): TradingViewRssNewsFeedParams {
  return {
    default: CRYPTO_RSS_NEWS_FEEDS,
    crypto: CRYPTO_RSS_NEWS_FEEDS,
  }
}
