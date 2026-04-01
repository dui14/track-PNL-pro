export const TOOL_NAMES = [
  'get_trade_history',
  'get_pnl_stats',
  'get_crypto_news',
  'get_market_quotes',
] as const
export type ToolName = (typeof TOOL_NAMES)[number]

export const TOOL_EXCHANGES = ['all', 'binance', 'okx', 'bybit', 'bitget', 'gateio'] as const
export type ToolExchange = (typeof TOOL_EXCHANGES)[number]

export const TOOL_PERIODS = ['7d', '30d', '90d'] as const
export type ToolPeriod = (typeof TOOL_PERIODS)[number]

type ToolParameter = {
  type: 'string' | 'number' | 'boolean'
  description: string
  enum?: readonly string[]
}

type ToolParameters = {
  type: 'object'
  properties: Record<string, ToolParameter>
  required?: string[]
  additionalProperties?: boolean
}

export type OpenRouterToolDefinition = {
  type: 'function'
  function: {
    name: ToolName
    description: string
    parameters: ToolParameters
  }
}

export const TOOL_DEFINITIONS: OpenRouterToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_trade_history',
      description: 'Lay lich su giao dich da dong gan day cua user trong he thong',
      parameters: {
        type: 'object',
        properties: {
          exchange: {
            type: 'string',
            description: 'Loc theo san giao dich',
            enum: TOOL_EXCHANGES,
          },
          symbol: {
            type: 'string',
            description: 'Loc theo cap giao dich, vi du BTCUSDT',
          },
          limit: {
            type: 'number',
            description: 'So luong giao dich toi da, toi thieu 1 toi da 50',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pnl_stats',
      description: 'Tinh thong ke PNL trong khoang thoi gian 7/30/90 ngay',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: 'Khoang thoi gian thong ke',
            enum: TOOL_PERIODS,
          },
          exchange: {
            type: 'string',
            description: 'Loc theo san giao dich',
            enum: TOOL_EXCHANGES,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_crypto_news',
      description: 'Lay tin tuc crypto moi nhat tu nhieu RSS feed song song',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Tu khoa loc tin tuc, vi du bitcoin, ethereum, etf',
          },
          limit: {
            type: 'number',
            description: 'So luong tin tuc toi da, toi thieu 1 toi da 12',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_quotes',
      description: 'Lay gia thi truong hien tai cho tai san nhu XAUUSD, NVDA va cac symbol pho bien',
      parameters: {
        type: 'object',
        properties: {
          symbols: {
            type: 'string',
            description: 'Danh sach symbol, tach boi dau phay. Vi du: XAUUSD,NVDA',
          },
          query: {
            type: 'string',
            description: 'Cau hoi hoac tu khoa de he thong tu trich xuat symbol neu symbols khong duoc cung cap',
          },
        },
        additionalProperties: false,
      },
    },
  },
]