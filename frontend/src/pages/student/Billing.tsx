import { FC, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Check,
  CreditCard,
  Crown,
  History,
  Lock,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";

import { LoadingRows } from "@/components/ui";
import { PremiumBadge } from "@/components/PremiumBadge";
import { useTheme } from "@/contexts/ThemeContext";
import {
  createPaymentOrder,
  getMyPremiumStatus,
  getPaymentHistory,
  mockCheckout,
} from "@/services/lmsService";
import {
  PaymentTransactionOut,
  PremiumStatusOut,
} from "@/types";

export default function BillingPage() {
  const { setPlan } = useTheme();
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatusOut | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransactionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<"click" | "payme">("click");
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusData, historyData] = await Promise.all([
        getMyPremiumStatus(),
        getPaymentHistory(),
      ]);
      setPremiumStatus(statusData);
      setPlan(statusData.premium_plan);
      setTransactions(historyData);
    } catch {
      toast.error("Failed to load subscription details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubscribe = async (plan: "standard" | "pro_vip") => {
    setProcessingPlan(plan);
    try {
      // 1. Create tokenized payment order
      const order = await createPaymentOrder({
        plan,
        provider: selectedProvider,
      });

      // 2. Perform tokenized simulated merchant checkout
      const result = await mockCheckout({
        order_id: order.order_id,
        token: order.token,
      });

      toast.success(result.message);
      // Refresh user data & theme capabilities
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Payment failed");
    } finally {
      setProcessingPlan(null);
    }
  };

  const currentPlan = premiumStatus?.premium_plan || "free";

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
          <span>💎</span>
          <span>Premium Plans & Billing</span>
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Upgrade your learning experience with custom themes, public revision notes, 1-on-1 peer chats, and AI coaching.
        </p>
      </div>

      {/* Current Subscription Status Banner */}
      <div className="card bg-linear-to-r from-blue-500/10 via-purple-500/10 to-amber-500/10 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
            Active Subscription
          </span>
          <div className="flex items-center gap-2 mt-1">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white capitalize">
              {currentPlan.replace("_", " ")} Plan
            </h2>
            <PremiumBadge
              plan={currentPlan}
              custom_badge={premiumStatus?.custom_badge}
              className="text-xl"
            />
          </div>
          {premiumStatus?.premium_expires_at && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Valid until: <b>{format(new Date(premiumStatus.premium_expires_at), "MMMM d, yyyy")}</b>
            </p>
          )}
        </div>

        {/* Payment Provider Selection */}
        <div className="flex flex-col gap-1.5 self-start sm:self-auto">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
            Payment Provider (Uzbekistan)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedProvider("click")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                selectedProvider === "click"
                  ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span>Click</span>
              <span className="text-[10px] opacity-80">Uz</span>
            </button>
            <button
              onClick={() => setSelectedProvider("payme")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                selectedProvider === "payme"
                  ? "bg-teal-600 text-white border-teal-600 shadow-xs"
                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span>Payme</span>
              <span className="text-[10px] opacity-80">Uz</span>
            </button>
          </div>
        </div>
      </div>

      {/* Security Guarantee Banner */}
      <div className="rounded-xl p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5 text-xs">
        <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
        <span>
          <b>Zero-Card-Storage Guarantee:</b> All payments are securely tokenized via official Click/Payme merchant endpoints. Our database never stores card numbers, expiration dates, or CVVs.
        </span>
      </div>

      {/* Pricing Tier Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Standard Plan */}
        <div
          className={`card flex flex-col justify-between p-6 border-2 transition-all ${
            currentPlan === "standard"
              ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md"
              : "border-zinc-200 dark:border-zinc-800 hover:border-blue-500/40"
          }`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                  Standard Learner
                </span>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mt-1 flex items-center gap-1.5">
                  <span>Standard</span>
                  <Star size={16} className="text-amber-500 fill-amber-500" />
                </h3>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-zinc-900 dark:text-white">19,000</span>
                <span className="text-xs text-zinc-400 font-medium block">UZS / month</span>
              </div>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Ideal for dedicated students who want premium themes, social revision notes, and safe AI coaching.
            </p>

            <ul className="space-y-2.5 text-xs text-zinc-600 dark:text-zinc-300 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <li className="flex items-center gap-2">
                <Check size={14} className="text-blue-500 shrink-0" />
                <span>All 4 Premium App Themes (Cyber Purple, Neon Pink, etc.)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-blue-500 shrink-0" />
                <span>⭐ Star Badge displayed across leaderboard & profile</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-blue-500 shrink-0" />
                <span>Publish public revision notes (Zametka)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-blue-500 shrink-0" />
                <span>1-on-1 private messaging with classmates</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-blue-500 shrink-0" />
                <span>🤖 Aura AI Learning Companion (error corrections & guidance)</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => handleSubscribe("standard")}
              disabled={processingPlan !== null || currentPlan === "standard"}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                currentPlan === "standard"
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  : "btn-primary"
              }`}
            >
              {processingPlan === "standard" ? (
                "Processing payment..."
              ) : currentPlan === "standard" ? (
                "Current Plan"
              ) : (
                `Subscribe via ${selectedProvider.toUpperCase()}`
              )}
            </button>
          </div>
        </div>

        {/* Pro VIP Plan */}
        <div
          className={`card flex flex-col justify-between p-6 border-2 relative overflow-hidden transition-all ${
            currentPlan === "pro_vip"
              ? "border-purple-500 ring-2 ring-purple-500/20 shadow-md"
              : "border-purple-500/40 hover:border-purple-500"
          }`}
        >
          {/* Top highlight badge */}
          <div className="absolute top-0 right-0 bg-linear-to-r from-purple-600 to-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1 shadow-xs">
            <Sparkles size={11} /> Best Value
          </div>

          <div className="space-y-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                Ultimate Experience
              </span>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mt-1 flex items-center gap-1.5">
                <span>Pro VIP</span>
                <Crown size={16} className="text-amber-500 fill-amber-500" />
              </h3>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-zinc-900 dark:text-white">29,000</span>
              <span className="text-xs text-zinc-400 font-medium">UZS / month</span>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Complete VIP access: create custom study groups, exclusive crown badge, and full social privileges.
            </p>

            <ul className="space-y-2.5 text-xs text-zinc-600 dark:text-zinc-300 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <li className="flex items-center gap-2">
                <Check size={14} className="text-purple-500 shrink-0" />
                <span className="font-semibold">All Standard Plan Features Included</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-purple-500 shrink-0" />
                <span className="font-bold text-purple-600 dark:text-purple-400">
                  👥 Create Custom Study Groups & Invite Classmates
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-purple-500 shrink-0" />
                <span>👑 Exclusive Gold Crown Badge on profile & leaderboard</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-purple-500 shrink-0" />
                <span>Animated gradient banner profile theme</span>
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-purple-500 shrink-0" />
                <span>Priority AI Companion response speed</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => handleSubscribe("pro_vip")}
              disabled={processingPlan !== null || currentPlan === "pro_vip"}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                currentPlan === "pro_vip"
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  : "bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md active:scale-98"
              }`}
            >
              {processingPlan === "pro_vip" ? (
                "Processing payment..."
              ) : currentPlan === "pro_vip" ? (
                "Current Plan"
              ) : (
                `Upgrade to Pro VIP via ${selectedProvider.toUpperCase()}`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Transaction History Section */}
      <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <History size={16} />
          <span>Payment & Order History</span>
        </h3>

        {loading ? (
          <LoadingRows rows={3} />
        ) : transactions.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">No past transactions found.</p>
        ) : (
          <div className="card overflow-x-auto p-0 border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-mono">
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Provider</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="p-3 font-mono font-medium text-zinc-700 dark:text-zinc-300">
                      {tx.provider_transaction_id}
                    </td>
                    <td className="p-3 font-semibold capitalize text-zinc-900 dark:text-white">
                      {tx.plan.replace("_", " ")}
                    </td>
                    <td className="p-3 font-mono font-bold text-zinc-900 dark:text-white">
                      {tx.amount_uzs.toLocaleString()} {tx.currency}
                    </td>
                    <td className="p-3 uppercase font-mono text-zinc-500">{tx.provider}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          tx.status === "completed"
                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-400 font-mono">
                      {format(new Date(tx.created_at), "yyyy-MM-dd HH:mm")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
