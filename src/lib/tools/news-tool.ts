type GetCryptoNewsArgs = {
  query?: string
  limit?: number
}

type NewsItem = {
  title: string
  link: string
  summary: string
  source: string
  publishedAt: string
}

type NewsSource = {
  name: string
  url: string
}

type NextFetchInit = RequestInit & {
  next?: {
    revalidate?: number
  }
}

const NEWS_LIMIT_DEFAULT = 8
const NEWS_LIMIT_MAX = 12

const NEWS_SOURCES: NewsSource[] = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
]

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
}

function stripMarkup(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function extractTagValue(xmlBlock: string, tagName: string): string | null {
  const safeTag = tagName.replace(':', '\\:')
  const regex = new RegExp(`<${safeTag}[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, 'i')
  const matched = xmlBlock.match(regex)
  if (!matched) return null
  return matched[1].trim()
}

function parseDateIso(value: string | null): string {
  if (!value) return new Date(0).toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date(0).toISOString()
  return parsed.toISOString()
}

function parseRss(xmlText: string, source: string): NewsItem[] {
  const itemBlocks = xmlText.match(/<item[\s\S]*?<\/item>/gi) ?? []

  return itemBlocks
    .map((itemBlock) => {
      const title = stripMarkup(extractTagValue(itemBlock, 'title') ?? '')
      const link = stripMarkup(extractTagValue(itemBlock, 'link') ?? '')
      const summary = stripMarkup(
        extractTagValue(itemBlock, 'description') ??
          extractTagValue(itemBlock, 'content:encoded') ??
          ''
      )
      const publishedAt = parseDateIso(extractTagValue(itemBlock, 'pubDate'))

      return {
        title,
        link,
        summary,
        source,
        publishedAt,
      }
    })
    .filter((item) => item.title.length > 0 && item.link.length > 0)
}

async function fetchRssFeed(source: NewsSource): Promise<NewsItem[]> {
  try {
    const response = await fetch(source.url, { next: { revalidate: 300 } } as NextFetchInit)
    if (!response.ok) return []

    const xmlText = await response.text()
    if (!xmlText.trim()) return []

    return parseRss(xmlText, source.name)
  } catch {
    return []
  }
}

function deduplicateNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()

  return items.filter((item) => {
    const key = `${item.link.toLowerCase()}|${item.title.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function getCryptoNewsTool(args: GetCryptoNewsArgs): Promise<Record<string, unknown>> {
  const keyword = args.query?.trim().toLowerCase() ?? ''
  const limit = clampNumber(args.limit ?? NEWS_LIMIT_DEFAULT, 1, NEWS_LIMIT_MAX)

  const settled = await Promise.allSettled(NEWS_SOURCES.map((source) => fetchRssFeed(source)))

  const successfulFeeds = settled
    .filter((entry): entry is PromiseFulfilledResult<NewsItem[]> => entry.status === 'fulfilled')
    .map((entry) => entry.value)

  const failedFeeds = settled.length - successfulFeeds.length
  const merged = deduplicateNews(successfulFeeds.flat())

  const filtered = merged
    .filter((item) => {
      if (!keyword) return true
      const searchable = `${item.title} ${item.summary}`.toLowerCase()
      return searchable.includes(keyword)
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  return {
    success: true,
    query: keyword || 'crypto',
    count: Math.min(filtered.length, limit),
    items: filtered.slice(0, limit),
    sources: {
      total: NEWS_SOURCES.length,
      failed: failedFeeds,
      succeeded: NEWS_SOURCES.length - failedFeeds,
    },
    fallback: filtered.length === 0,
  }
}