import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const MAX_OPEN_WINDOWS = 3

type ChatUIContextValue = {
  openWindows: number[]
  // Messenger-style minimize: a minimized window stays in openWindows (so
  // it still occupies its corner-stack slot) but collapses to just its
  // header bar — see FloatingChatWindows.tsx.
  minimizedIds: number[]
  openChatWindow: (conversationId: number) => void
  closeChatWindow: (conversationId: number) => void
  toggleMinimizeChatWindow: (conversationId: number) => void
}

const ChatUIContext = createContext<ChatUIContextValue | null>(null)

export function ChatUIProvider({ children }: { children: ReactNode }) {
  // The full requested order — everything past MAX_OPEN_WINDOWS is queued
  // and stays hidden until a visible window closes and it shifts up.
  const [chatWindowIds, setChatWindowIds] = useState<number[]>([])
  const [minimizedIds, setMinimizedIds] = useState<number[]>([])

  const openChatWindow = useCallback((conversationId: number) => {
    setChatWindowIds((prev) => (prev.includes(conversationId) ? prev : [...prev, conversationId]))
    // Opening (or reopening, e.g. from a new-message popup) a conversation
    // always surfaces it expanded — same as clicking a minimized Messenger
    // bubble reopens the full window rather than toggling it shut.
    setMinimizedIds((prev) => (prev.includes(conversationId) ? prev.filter((id) => id !== conversationId) : prev))
  }, [])

  const closeChatWindow = useCallback((conversationId: number) => {
    setChatWindowIds((prev) => prev.filter((id) => id !== conversationId))
    setMinimizedIds((prev) => (prev.includes(conversationId) ? prev.filter((id) => id !== conversationId) : prev))
  }, [])

  const toggleMinimizeChatWindow = useCallback((conversationId: number) => {
    setMinimizedIds((prev) =>
      prev.includes(conversationId) ? prev.filter((id) => id !== conversationId) : [...prev, conversationId]
    )
  }, [])

  const value = useMemo(
    () => ({
      openWindows: chatWindowIds.slice(0, MAX_OPEN_WINDOWS),
      minimizedIds,
      openChatWindow,
      closeChatWindow,
      toggleMinimizeChatWindow,
    }),
    [chatWindowIds, minimizedIds, openChatWindow, closeChatWindow, toggleMinimizeChatWindow]
  )

  return <ChatUIContext.Provider value={value}>{children}</ChatUIContext.Provider>
}

export function useChatUI() {
  const ctx = useContext(ChatUIContext)
  if (!ctx) throw new Error('useChatUI must be used within ChatUIProvider')
  return ctx
}
