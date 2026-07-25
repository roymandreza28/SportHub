import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const MAX_OPEN_WINDOWS = 3

type ChatUIContextValue = {
  openWindows: number[]
  openChatWindow: (conversationId: number) => void
  closeChatWindow: (conversationId: number) => void
}

const ChatUIContext = createContext<ChatUIContextValue | null>(null)

export function ChatUIProvider({ children }: { children: ReactNode }) {
  // The full requested order — everything past MAX_OPEN_WINDOWS is queued
  // and stays hidden until a visible window closes and it shifts up.
  const [chatWindowIds, setChatWindowIds] = useState<number[]>([])

  const openChatWindow = useCallback((conversationId: number) => {
    setChatWindowIds((prev) => (prev.includes(conversationId) ? prev : [...prev, conversationId]))
  }, [])

  const closeChatWindow = useCallback((conversationId: number) => {
    setChatWindowIds((prev) => prev.filter((id) => id !== conversationId))
  }, [])

  const value = useMemo(
    () => ({
      openWindows: chatWindowIds.slice(0, MAX_OPEN_WINDOWS),
      openChatWindow,
      closeChatWindow,
    }),
    [chatWindowIds, openChatWindow, closeChatWindow]
  )

  return <ChatUIContext.Provider value={value}>{children}</ChatUIContext.Provider>
}

export function useChatUI() {
  const ctx = useContext(ChatUIContext)
  if (!ctx) throw new Error('useChatUI must be used within ChatUIProvider')
  return ctx
}
