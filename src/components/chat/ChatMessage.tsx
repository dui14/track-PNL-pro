'use client'

import ReactMarkdown from 'react-markdown'
import type { ChatMessage as ChatMessageModel } from '@/lib/types'
import { AgentThinkingPanel, type AgentThinkingStep } from '@/components/chat/AgentThinkingPanel'

export type ChatMessageProps = {
  message: ChatMessageModel
  showThinkingPanel?: boolean
  thinkingSteps?: AgentThinkingStep[]
  isThinking?: boolean
  elapsedTime?: number
  thinkingCollapsed?: boolean
  onToggleThinkingCollapsed?: () => void
}

export function ChatMessage({
  message,
  showThinkingPanel = false,
  thinkingSteps = [],
  isThinking = false,
  elapsedTime = 0,
  thinkingCollapsed = false,
  onToggleThinkingCollapsed,
}: ChatMessageProps): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="flex gap-4 justify-end">
        <div className="max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed bg-primary text-white rounded-tr-none">
          {message.content}
        </div>
        <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-1">
          <span className="material-symbols-outlined text-primary text-base">person</span>
        </div>
      </div>
    )
  }

  const shouldShowThinkingPanel =
    showThinkingPanel && (isThinking || thinkingSteps.length > 0) && Boolean(onToggleThinkingCollapsed)
  const handleToggleThinkingCollapsed = onToggleThinkingCollapsed ?? (() => undefined)
  const hasAssistantContent = message.content.trim().length > 0

  return (
    <div className="flex gap-4 justify-start">
      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
        <span className="material-symbols-outlined text-primary text-base">smart_toy</span>
      </div>
      <div className="max-w-2xl flex-1 space-y-2">
        {shouldShowThinkingPanel ? (
          <AgentThinkingPanel
            steps={thinkingSteps}
            isThinking={isThinking}
            elapsedTime={elapsedTime}
            isCollapsed={thinkingCollapsed}
            onToggleCollapsed={handleToggleThinkingCollapsed}
          />
        ) : null}
        <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-neutral-dark border border-neutral-border text-slate-200 rounded-tl-none">
          {hasAssistantContent ? (
            <div className="prose prose-sm prose-invert max-w-none prose-p:my-0 prose-headings:my-0">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => (
                    <h2 className="text-sm font-semibold text-slate-100 mt-3 mb-1 border-b border-neutral-border pb-1">
                      {children}
                    </h2>
                  ),
                  p: ({ children }) => <p className="text-sm leading-relaxed mb-2 text-slate-200">{children}</p>,
                  ul: ({ children }) => <ul className="text-sm space-y-1 ml-3 mb-2">{children}</ul>,
                  li: ({ children }) => (
                    <li className="flex gap-2 before:content-['·'] before:text-slate-500 text-slate-200">
                      {children}
                    </li>
                  ),
                  strong: ({ children }) => <span className="font-semibold text-slate-100">{children}</span>,
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            <span className="inline-flex gap-1 items-center text-slate-400">
              <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
              <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
              <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
