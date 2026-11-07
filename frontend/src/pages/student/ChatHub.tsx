import { FC, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  CheckCheck,
  MessageSquare,
  Send,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

import { LoadingRows } from "@/components/ui";
import { UserAvatar } from "@/components/common/UserAvatar";
import { PremiumBadge } from "@/components/PremiumBadge";
import {
  getPeerMessages,
  listChatContacts,
  sendPrivateMessage,
} from "@/services/lmsService";
import {
  PeerChatContactOut,
  PrivateMessageOut,
} from "@/types";

export default function ChatHubPage() {
  // Peer Chat state
  const [contacts, setContacts] = useState<PeerChatContactOut[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<PeerChatContactOut | null>(null);
  const [peerMessages, setPeerMessages] = useState<PrivateMessageOut[]>([]);
  const [peerInput, setPeerInput] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingPeerMessages, setLoadingPeerMessages] = useState(false);
  const [sendingPeerMessage, setSendingPeerMessage] = useState(false);
  const peerMessagesEndRef = useRef<HTMLDivElement>(null);

  // Load Peer contacts
  useEffect(() => {
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
  }, []);

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

  // Send Peer message
  const handleSendPeer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peerInput.trim() || !selectedPeer || sendingPeerMessage) return;

    const content = peerInput.trim();
    setPeerInput("");

    // Optimistic message
    const tempMsg: PrivateMessageOut = {
      id: "temp-" + Date.now(),
      sender_id: "me",
      recipient_id: selectedPeer.student_id,
      content,
      is_read: false,
      created_at: new Date().toISOString(),
      sender_name: "Me",
      is_me: true,
    };
    setPeerMessages((prev) => [...prev, tempMsg]);
    setSendingPeerMessage(true);
    setTimeout(() => peerMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const saved = await sendPrivateMessage({
        recipient_id: selectedPeer.student_id,
        content,
      });
      // Replace temp message with server record
      setPeerMessages((prev) => prev.map((m) => (m.id === tempMsg.id ? saved : m)));
      setTimeout(() => peerMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to send message");
      // Remove failed optimistic message
      setPeerMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    } finally {
      setSendingPeerMessage(false);
    }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto h-[calc(100vh-6.5rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Classmate & Peer Messages</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Direct 1-on-1 private messaging with your cohort classmates and study partners.
          </p>
        </div>
      </div>

      {/* ─── PEER CHAT (1-ON-1) ─────────────────────────────────── */}
      <div className="flex-1 card overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-3">
        {/* Contacts List */}
        <div className="border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto flex flex-col">
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Classmates & Peers</span>
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
              {contacts.length} Connected
            </span>
          </div>

          <div className="flex-1 divide-y divide-zinc-100 dark:divide-zinc-800/60 overflow-y-auto">
            {loadingContacts ? (
              <div className="p-3">
                <LoadingRows rows={3} />
              </div>
            ) : contacts.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400 space-y-1">
                <p className="font-semibold text-zinc-600 dark:text-zinc-300">No peers in your cohort yet</p>
                <p className="text-[11px] text-zinc-400">Classmates enrolled in your active cohort will automatically appear here!</p>
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
                    placeholder={`Message ${selectedPeer.full_name}...`}
                    disabled={sendingPeerMessage}
                    value={peerInput}
                    onChange={(e) => setPeerInput(e.target.value)}
                    className="input text-xs py-2.5 flex-1"
                  />
                  <button
                    type="submit"
                    disabled={!peerInput.trim() || sendingPeerMessage}
                    className="btn-primary text-xs py-2.5 px-4 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
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
    </div>
  );
}
