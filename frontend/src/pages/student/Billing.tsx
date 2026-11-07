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
  X,
  Zap,
} from "lucide-react";
import toast from "react-hot-toast";

import { LoadingRows } from "@/components/ui";
import { PremiumBadge } from "@/components/PremiumBadge";
import { useTheme } from "@/contexts/ThemeContext";
import {
  completePaymentCheckout,
  createPaymentOrder,
  getMyPremiumStatus,
  getPaymentHistory,
} from "@/services/lmsService";
import {
  PaymentTransactionOut,
  PremiumStatusOut,
} from "@/types";

/* ──────────────── Direct Gateway Payment Modal ──────────────── */
interface PaymentModalProps {
  plan: "standard";
  amountUzs: number;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

const DirectPaymentModal: FC<PaymentModalProps> = ({
  plan,
  amountUzs,
  onClose,
  onSuccess,
}) => {
  const [processingProvider, setProcessingProvider] = useState<"click" | "payme" | null>(null);

  const handlePay = async (provider: "click" | "payme") => {
    setProcessingProvider(provider);
    try {
      // Step 1: Create tokenized gateway order
      const order = await createPaymentOrder({
        plan,
        provider,
      });

      // Step 2: Automatically complete & activate the plan immediately
      await completePaymentCheckout({
        order_id: order.order_id,
        token: order.token,
      });

      const providerLabel = provider === "click" ? "Click" : "Payme";
      toast.success(
        `🎉 Payment of ${amountUzs.toLocaleString()} UZS confirmed via ${providerLabel}! Plan '${plan.replace("_", " ")}' is now active for 30 days.`,
        { duration: 6000 }
      );

      // Step 3: Refresh user subscription status & close modal
      await onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Payment processing failed. Please try again.");
    } finally {
      setProcessingProvider(null);
    }
  };

  const planTitle = "Standard";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden border border-black/[0.08] dark:border-white/[0.08]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/20 transition cursor-pointer text-white/80 hover:text-white"
          >
            <X size={20} />
          </button>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 text-xs font-semibold backdrop-blur-md mb-2">
            <Zap size={13} className="text-amber-300" />
            <span>Instant Auto-Activation</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Choose Payment Method</h2>
          <p className="text-xs text-white/80 mt-1">
            Upgrading to <b>{planTitle} Plan</b> — <b>{amountUzs.toLocaleString()} UZS</b>
          </p>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
            Select your preferred official payment gateway for instant, secure checkout:
          </p>

          {/* Click Button Card */}
          <button
            type="button"
            disabled={processingProvider !== null}
            onClick={() => handlePay("click")}
            className="w-full p-4 rounded-2xl border-2 border-blue-500/30 hover:border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all flex items-center justify-between group cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-xs active:scale-[0.99]"
          >
            <div className="flex items-center gap-3.5 text-left">
              <div className="w-12 h-12 rounded-xl bg-[#0073FF] text-white flex items-center justify-center font-black text-sm tracking-wider shadow-md shadow-blue-500/25 shrink-0">
                CLICK
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                    Click Evolution / Up
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                    Official
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Direct one-click checkout via Click
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              {processingProvider === "click" ? (
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 animate-pulse">
                  Processing...
                </span>
              ) : (
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow-xs group-hover:bg-blue-700 transition">
                  Pay with Click
                </span>
              )}
            </div>
          </button>

          {/* Payme Button Card */}
          <button
            type="button"
            disabled={processingProvider !== null}
            onClick={() => handlePay("payme")}
            className="w-full p-4 rounded-2xl border-2 border-teal-500/30 hover:border-teal-600 bg-teal-50/40 dark:bg-teal-950/20 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-all flex items-center justify-between group cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-xs active:scale-[0.99]"
          >
            <div className="flex items-center gap-3.5 text-left">
              <div className="w-12 h-12 rounded-xl bg-[#00B5A6] text-white flex items-center justify-center font-black text-sm tracking-wider shadow-md shadow-teal-500/25 shrink-0">
                payme
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition">
                    Payme Uzbekistan
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300">
                    Official
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Fast checkout via Payme app or web
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              {processingProvider === "payme" ? (
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400 animate-pulse">
                  Processing...
                </span>
              ) : (
                <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[#00B5A6] text-white shadow-xs group-hover:bg-teal-600 transition">
                  Pay with Payme
                </span>
              )}
            </div>
          </button>

          {/* Guarantee info */}
          <div className="rounded-xl p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
            <span>
              Secure instant checkout. Plan activates automatically upon confirmation with zero manual waiting.
            </span>
          </div>

          {/* Cancel button */}
          <button
            type="button"
            onClick={onClose}
            disabled={processingProvider !== null}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};


/* ──────────────── Main Billing Page ──────────────── */
export default function BillingPage() {
  const { setPlan } = useTheme();
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatusOut | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransactionOut[]>([]);
  const [loading, setLoading] = useState(true);

  // Direct Payment modal state
  const [paymentModal, setPaymentModal] = useState<{
    plan: "standard";
    amountUzs: number;
  } | null>(null);

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

  const handleOpenSubscribe = () => {
    setPaymentModal({
      plan: "standard",
      amountUzs: 19000,
    });
  };

  const currentPlan = premiumStatus?.premium_plan || "free";

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 sm:p-6">
      {/* Direct Payment Gateway Modal */}
      {paymentModal && (
        <DirectPaymentModal
          plan={paymentModal.plan}
          amountUzs={paymentModal.amountUzs}
          onClose={() => setPaymentModal(null)}
          onSuccess={loadData}
        />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
          <span>💎</span>
          <span>Premium Plans & Billing</span>
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          All coursework, homework submissions, stars, XP, AI evaluation, and Telegram bot linking are 100% Free! Upgrades provide optional priority homework review queue and VIP badges.
        </p>
      </div>

      {/* Current Subscription Status Banner */}
      <div className="card bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-amber-500/10 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
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
      </div>

      {/* Payment Gateway Info Banner */}
      <div className="rounded-2xl p-4 bg-gradient-to-r from-blue-500/10 to-teal-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-200 flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <CreditCard size={20} className="text-blue-600 dark:text-blue-400 shrink-0" />
          <span>
            <b>Official Payment Gateways:</b> Pay securely using <b>Click</b> or <b>Payme</b>. Plans update automatically upon payment.
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded font-black text-[10px] bg-[#0073FF] text-white">
            CLICK
          </span>
          <span className="px-2 py-0.5 rounded font-black text-[10px] bg-[#00B5A6] text-white">
            payme
          </span>
        </div>
      </div>

      {/* Pricing Tier - Single Standard 19,000 UZS Plan */}
      <div className="max-w-xl mx-auto w-full">
        <div
          className={`card flex flex-col justify-between p-6 sm:p-8 border-2 transition-all ${
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
                  <span>Standard Plan</span>
                  <Star size={16} className="text-amber-500 fill-amber-500" />
                </h3>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-zinc-900 dark:text-white">19,000</span>
                <span className="text-xs text-zinc-400 font-medium block">UZS / month</span>
              </div>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Ideal for dedicated students who want priority homework review queue, premium themes, and star badges.
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
                <span className="font-semibold text-blue-600 dark:text-blue-400">⚡ Priority Homework Checking Queue</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => handleOpenSubscribe()}
              disabled={currentPlan === "standard"}
              className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                currentPlan === "standard"
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  : "btn-primary shadow-md shadow-blue-500/20 text-sm"
              }`}
            >
              {currentPlan === "standard" ? (
                "Current Plan (Active)"
              ) : (
                <>
                  <Zap size={15} />
                  <span>Subscribe with Click / Payme (19,000 UZS)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Transaction & Order History */}
      <div className="card p-6 border border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <History size={16} className="text-zinc-500" />
            <span>Payment & Order History</span>
          </h3>
          <span className="text-xs text-zinc-400">
            {transactions.length} record{transactions.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <LoadingRows rows={3} />
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400">
            No payment transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Plan</th>
                  <th className="py-2.5 px-3">Gateway</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-2.5 px-3 font-mono font-medium text-zinc-900 dark:text-white">
                      {tx.provider_transaction_id}
                    </td>
                    <td className="py-2.5 px-3 capitalize">
                      {tx.plan.replace("_", " ")}
                    </td>
                    <td className="py-2.5 px-3 uppercase font-semibold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        tx.provider === "click"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                          : tx.provider === "payme"
                          ? "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}>
                        {tx.provider}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold">
                      {tx.amount_uzs.toLocaleString()} UZS
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          tx.status === "completed" || tx.status === "paid"
                            ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                            : tx.status === "failed" || tx.status === "rejected"
                            ? "bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300"
                            : "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400">
                      {format(new Date(tx.created_at), "MMM d, yyyy HH:mm")}
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
