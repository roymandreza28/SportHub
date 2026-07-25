import { createContext, useContext, useState, type ReactNode } from 'react'

type ChatUIContextValue = {
  pendingConversationId: number | null
  requestConversation: (conversationId: number) => void
  consumePendingConversation: () => void
}

const ChatUIContext = createContext<ChatUIContextValue | null>(null)

export function ChatUIProvider({ children }: { children: ReactNode }) {
  const [pendingConversationId, setPendingConversationId] = useState<number | null>(null)

  return (
    <ChatUIContext.Provider
      value={{
        pendingConversationId,
        requestConversation: setPendingConversationId,
        consumePendingConversation: () => setPendingConversationId(null),
      }}
    >
      {children}
    </ChatUIContext.Provider>
  )
}

export function useChatUI() {
  const ctx = useContext(ChatUIContext)
  if (!ctx) throw new Error('useChatUI must be used within ChatUIProvider')
  return ctx
}
