export interface AiConversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessage {
  id: number;
  conversationId: number;
  role: "user" | "model";
  content: string;
  createdAt: string;
}

export interface AiMessagePage {
  content: AiMessage[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}
