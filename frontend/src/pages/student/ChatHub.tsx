import { FC, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Bot,
  CheckCheck,
  Lock,
  MessageSquare,
  Send,
  ShieldAlert,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

import { EmptyState, LoadingRows } from "@/components/ui";
import { UserAvatar } from "@/components/common/UserAvatar";
import { PremiumBadge } from "@/components/PremiumBadge";
import {
  chatWithAI,
  getAIChatHistory,
  getMyPremiumStatus,
  getPeerMessages,
  listChatContacts,
  sendPrivateMessage,
} from "@/services/lmsService";
import {
  AIChatMessageOut,
  PeerChatContactOut,
  PremiumStatusOut,
  PrivateMessageOut,
} from "@/types";

const SUGGESTED_PROMPTS = [
  "Can you explain the difference between 'Since' and 'For'?",
  "Please check this sentence for mistakes: 'I have went to London last year.'",
  "Give me 5 advanced IELTS collocations for the topic of Technology.",
  "How can I structure an opinion essay without repeating words?",
];

export default function ChatHubPage() {
  const [activeTab, setActiveTab] = useState<"ai" | "peer">("ai");
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatusOut | null>(null);

  // AI Chat state
  const [aiMessages, setAiMessages] = useState<AIChatMessageOut[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingAiHistory, setLoadingAiHistory] = useState(true);
  const aiMessagesEndRef = useRef<HTMLDivElement>(null);

  // Peer Chat state
  const [contacts, setContacts] = useState<PeerChatContactOut[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<PeerChatContactOut | null>(null);
  const [peerMessages, setPeerMessages] = useState<PrivateMessageOut[]>([]);
  const [peerInput, setPeerInput] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingPeerMessages, setLoadingPeerMessages] = useState(false);
  const [sendingPeerMessage, setSendingPeerMessage] = useState(false);
  const peerMessagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMyPremiumStatus()
      .then(setPremiumStatus)
      .catch(() => {});
  }, []);

  const canPrivateChat = Boolean(premiumStatus?.can_private_chat || premiumStatus?.is_premium);

  // Load AI history
  useEffect(() => {
    if (activeTab === "ai") {
      setLoadingAiHistory(true);
      getAIChatHistory()
        .then((hist) => {
          setAiMessages(hist);
          setTimeout(() => aiMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        })
        .catch(() => {})
        .finally(() => setLoadingAiHistory(false));
    }
  }, [activeTab]);

  // Load Peer contacts
  useEffect(() => {
    if (activeTab === "peer") {
      setLoadingContacts(true);
      listChatContacts()
        .then((data) => {
          setContacts(data);
          if (data.length > 0 && !selectedPeer) {
            setSelectedPeer(data[0]);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingContacts(false));
    }
  }, [activeTab]);

  // Load messages for selected peer
  useEffect(() => {
    if (selectedPeer) {
      setLoadingPeerMessages(true);
      getPeerMessages(selectedPeer.student_id)
        .then((msgs) => {
          setPeerMessages(msgs);
          setTimeout(() => peerMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        })
        .catch(() => {})
        .finally(() => setLoadingPeerMessages(false));
    }
  }, [selectedPeer]);

  // Send AI message
  const handleSendAi = async (textToSend?: string) => {
    const text = (textToSend || aiInput).trim();
    if (!text || loadingAi) return;

    if (!canPrivateChat) {
      toast.error("AI Learning Companion requires Standard (19k) or Pro VIP (29k) plan.");
      return;
    }

    setAiInput("");
    // Optimistic user bubble
    const tempUserMsg: AIChatMessageOut = {
      id: "temp-" + Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setAiMessages((prev) => [...prev, tempUserMsg]);
    setLoadingAi(true);
    setTimeout(() => aiMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const response = await chatWithAI({ message: text });
      setAiMessages((prev) => [...prev, response]);
      setTimeout(() => aiMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "AI response failed");
    } finally {
      setLoadingAi(false);
    }
  };

  // Send Peer message
  const handleSendPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peerInput.trim() || !selectedPeer || sendingPeerMessage) return;

    if (!canPrivateChat) {
      toast.error("Private messaging requires Standard (19k) or Pro VIP (29k) plan.");
      return;
    }

    setSendingPeerMessage(true);
    try {
      const msg = await sendPrivateMessage({
        recipient_id: selectedPeer.student_id,
        content: peerInput.trim(),
      });
      setPeerMessages((prev) => [...prev, msg]);
      setPeerInput("");
      setTimeout(() => peerMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to send message");
    } finally {
      setSendingPeerMessage(false);
    }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto p-4 sm:p-6 h-[calc(100vh-5rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <span>💬</span>
            <span>Communication & AI Learning Coach</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            1-on-1 classmate messaging & intelligent AI guidance with pedagogical guardrails.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-800/80 p-1 self-start sm:self-auto border border-black/[0.05] dark:border-white/[0.05]">
          <button
            onClick={() => setActiveTab("ai")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "ai"
                ? "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Sparkles size={14} />
            <span>AI Companion (Aura)</span>
          </button>
          <button
            onClick={() => setActiveTab("peer")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "peer"
                ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Users size={14} />
            <span>Peer Chat</span>
          </button>
        </div>
      </div>

      {/* ─── TAB 1: AI LEARNING COMPANION ───────────────────────────────── */}
      {activeTab === "ai" && (
        <div className="flex-1 flex flex-col card overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800">
          {/* Pedagogical Banner */}
          <div className="bg-purple-500/10 dark:bg-purple-950/30 border-b border-purple-500/20 px-4 py-2.5 flex items-center justify-between text-xs text-purple-800 dark:text-purple-300">
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-purple-600 dark:text-purple-400 shrink-0" />
              <span>
                <b>Pedagogical Guardrails Active:</b> Aura guides your thinking and corrects errors, but will <b>never</b> generate direct homework solutions or essays.
              </span>
            </div>
            {!canPrivateChat && (
              <span className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                <Lock size={12} /> Standard/Pro VIP only
              </span>
            )}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingAiHistory ? (
              <LoadingRows rows={3} />
            ) : aiMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center text-2xl shadow-xs">
                  🤖
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    Hi! I&apos;m Aura, your English Learning Companion
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mt-1">
                    Ask me grammar questions, share sentences you want me to review, or practice conversation!
                  </p>
                </div>

                {/* Prompt suggestions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full text-left">
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendAi(prompt)}
                      className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-purple-500/50 hover:bg-purple-50/30 dark:hover:bg-purple-950/20 text-xs text-zinc-700 dark:text-zinc-300 transition text-left cursor-pointer"
                    >
                      💡 {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              aiMessages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                        isUser
                          ? "bg-blue-600 text-white font-bold"
                          : "bg-purple-600 text-white font-bold shadow-xs"
                      }`}
                    >
                      {isUser ? "You" : "🤖"}
                    </div>

                    <div
                      className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        isUser
                          ? "bg-blue-600 text-white rounded-tr-none"
                          : "bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 rounded-tl-none whitespace-pre-wrap border border-black/[0.05] dark:border-white/[0.05]"
                      }`}
                    >
                      {msg.content}
                      <div
                        className={`text-[9px] mt-1 font-mono ${
                          isUser ? "text-blue-100 text-right" : "text-zinc-400 text-left"
                        }`}
                      >
                        {format(new Date(msg.created_at), "HH:mm")}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {loadingAi && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs animate-pulse">
                  🤖
                </div>
                <span>Aura is formulating pedagogical guidance...</span>
              </div>
            )}
            <div ref={aiMessagesEndRef} />
          </div>

          {/* AI Input Box */}
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAi();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder={
                  canPrivateChat
                    ? "Ask Aura a question or paste text for feedback..."
                    : "🔒 Upgrade to Standard (19k) or Pro VIP (29k) to chat with Aura"
                }
                disabled={!canPrivateChat || loadingAi}
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                className="input text-xs py-2.5 flex-1"
              />
              <button
                type="submit"
                disabled={!canPrivateChat || !aiInput.trim() || loadingAi}
                className="btn-primary text-xs py-2.5 px-4 cursor-pointer disabled:opacity-50"
              >
                <Send size={14} />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── TAB 2: PEER CHAT (1-ON-1) ─────────────────────────────────── */}
      {activeTab === "peer" && (
        <div className="flex-1 card overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-3">
          {/* Contacts List */}
          <div className="border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto flex flex-col">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Classmates & Peers
              </span>
            </div>

            <div className="flex-1 divide-y divide-zinc-100 dark:divide-zinc-800/60 overflow-y-auto">
              {loadingContacts ? (
                <div className="p-3">
                  <LoadingRows rows={3} />
                </div>
              ) : contacts.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-400">
                  No peers available yet.
                </div>
              ) : (
                contacts.map((contact) => {
                  const isSelected = selectedPeer?.student_id === contact.student_id;
                  return (
                    <button
                      key={contact.student_id}
                      onClick={() => setSelectedPeer(contact)}
                      className={`w-full p-3 flex items-center gap-2.5 text-left transition cursor-pointer ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-600"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <UserAvatar
                        src={contact.avatar_url}
                        name={contact.full_name}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                            {contact.full_name}
                          </span>
                          <PremiumBadge
                            plan={contact.premium_plan}
                            custom_badge={contact.custom_badge}
                          />
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {contact.last_message || `@${contact.username || "student"}`}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div className="md:col-span-2 flex flex-col h-full bg-zinc-50/50 dark:bg-zinc-900/30">
            {selectedPeer ? (
              <>
                {/* Peer Header */}
                <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22] flex items-center gap-2.5">
                  <UserAvatar
                    src={selectedPeer.avatar_url}
                    name={selectedPeer.full_name}
                    size="sm"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white">
                        {selectedPeer.full_name}
                      </span>
                      <PremiumBadge
                        plan={selectedPeer.premium_plan}
                        custom_badge={selectedPeer.custom_badge}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      @{selectedPeer.username || "student"}
                    </span>
                  </div>
                </div>

                {/* Message Log */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {loadingPeerMessages ? (
                    <LoadingRows rows={3} />
                  ) : peerMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center text-xs text-zinc-400">
                      No messages with {selectedPeer.full_name} yet. Say hello! 👋
                    </div>
                  ) : (
                    peerMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.is_me ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                            m.is_me
                              ? "bg-blue-600 text-white rounded-tr-none"
                              : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-none border border-black/[0.05] dark:border-white/[0.05]"
                          }`}
                        >
                          <p>{m.content}</p>
                          <div
                            className={`text-[9px] mt-1 font-mono flex items-center gap-1 ${
                              m.is_me
                                ? "text-blue-100 justify-end"
                                : "text-zinc-400 justify-start"
                            }`}
                          >
                            <span>{format(new Date(m.created_at), "HH:mm")}</span>
                            {m.is_me && <CheckCheck size={11} />}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={peerMessagesEndRef} />
                </div>

                {/* Peer Input */}
                <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22]">
                  <form onSubmit={handleSendPeer} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={
                        canPrivateChat
                          ? `Message ${selectedPeer.full_name}...`
                          : "🔒 Private messaging requires Standard or Pro VIP plan"
                      }
                      disabled={!canPrivateChat || sendingPeerMessage}
                      value={peerInput}
                      onChange={(e) => setPeerInput(e.target.value)}
                      className="input text-xs py-2.5 flex-1"
                    />
                    <button
                      type="submit"
                      disabled={!canPrivateChat || !peerInput.trim() || sendingPeerMessage}
                      className="btn-primary text-xs py-2.5 px-4 cursor-pointer disabled:opacity-50"
                    >
                      <Send size={14} />
                      <span>Send</span>
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                Select a classmate to begin chatting.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
