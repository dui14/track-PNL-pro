import { Suspense } from 'react'
import { AIChatInterface, type AIModelOption } from '@/components/features/ai-assistant/AIChatInterface'

const DEFAULT_MODEL_ID = 'google/gemini-3-flash-preview'

type ModelEnvMapping = {
  key: string
  label: string
}

const MODEL_ENV_MAPPINGS: ModelEnvMapping[] = [
  { key: 'MODELS_GEMINI', label: 'Gemini 3 Flash' },
  { key: 'MODELS_GPT', label: 'GPT' },
  { key: 'MODELS_CLAUDE', label: 'Claude Sonnet' },
  { key: 'MODELS_GROK', label: 'Grok' },
  { key: 'MODELS_DEEPSEEK', label: 'DeepSeek' },
  { key: 'MODELS_QWEN', label: 'Qwen' },
]

function readEnvString(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildModelOptions(): AIModelOption[] {
  const options: AIModelOption[] = []
  const seen = new Set<string>()

  for (const mapping of MODEL_ENV_MAPPINGS) {
    const value = readEnvString(process.env[mapping.key])
    if (!value || seen.has(value)) continue

    seen.add(value)
    options.push({
      id: value,
      label: mapping.label,
    })
  }

  const openRouterModel = readEnvString(process.env.OPENROUTER_MODEL) ?? DEFAULT_MODEL_ID
  if (!seen.has(openRouterModel)) {
    options.unshift({
      id: openRouterModel,
      label: 'Mặc định',
    })
  }

  if (options.length === 0) {
    return [{ id: DEFAULT_MODEL_ID, label: 'Mặc định' }]
  }

  return options
}

function resolveDefaultModelId(options: AIModelOption[]): string {
  const openRouterModel = readEnvString(process.env.OPENROUTER_MODEL)
  if (openRouterModel && options.some((option) => option.id === openRouterModel)) {
    return openRouterModel
  }

  const defaultOption = options[0]
  return defaultOption?.id ?? DEFAULT_MODEL_ID
}

export default function AIAssistantPage(): React.JSX.Element {
  const modelOptions = buildModelOptions()
  const defaultModelId = resolveDefaultModelId(modelOptions)

  return (
    <Suspense>
      <AIChatInterface modelOptions={modelOptions} defaultModelId={defaultModelId} />
    </Suspense>
  )
}
