import { FC, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
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
  createPaymentOrder,
  getMyPremiumStatus,
  getPaymentHistory,
} from "@/services/lmsService";
import {
  PaymentTransactionOut,
  PremiumStatusOut,
} from "@/types";

/* ──────────────── Card Transfer Details ──────────────── */
const TRANSFER_CARD = {
  number: "9860 1678 2097 3722",
  holder: "Mansurbek Jobborov",
};

/* ──────────────── Payment Instruction Modal ──────────────── */
interface PaymentModalProps {
  plan: "standard" | "pro_vip";
  amountUzs: number;
  orderId: string;
  onClose: () => void;
  onConfirmSent: () => void;
  confirming: boolean;
}

const PaymentInstructionModal: FC<PaymentModalProps> = ({
  plan,
  amountUzs,
  orderId,
  onClose,
  onConfirmSent,
  confirming,
}) => {
  const copyCard = () => {
    navigator.clipboard.writeText(TRANSFER_CARD.number.replace(/\s/g, ""));
    toast.success("Card number copied!");
  };
  const copyAmount = () => {
    navigator.clipboard.writeText(String(amountUzs));
    toast.success("Amount copied!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-5 text-white">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/20 transition cursor-pointer"
          >
            <X size={18} />
          </button>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CreditCard size={20} />
            Payment Transfer
          </h2>
          <p className="text-sm text-white/80 mt-1">
            {plan === "pro_vip" ? "Pro VIP" : "Standard"} Plan — Order #{orderId}
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* Amount */}
          <div className="text-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
              Transfer Exactly
            </span>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="text-3xl font-black text-zinc-900 dark:text-white">
                {amountUzs.toLocaleString()}
              </span>
              <span className="text-sm text-zinc-400 font-medium">UZS</span>
              <button
                onClick={copyAmount}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                title="Copy amount"
              >
                <Copy size={14} className="text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Card Details */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-3 border border-zinc-200 dark:border-zinc-700">
            <div>
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Card Number (Uzcard)
              </span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-lg font-bold font-mono text-zinc-900 dark:text-white tracking-wider">
                  {TRANSFER_CARD.number}
                </span>
                <button
                  onClick={copyCard}
                  className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition cursor-pointer"
                  title="Copy card number"
                >
                  <Copy size={14} className="text-blue-600 dark:text-blue-400" />
                </button>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Card Holder
              </span>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white mt-0.5">
                {TRANSFER_CARD.holder}
              </p>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3.5 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Important Instructions:</p>
                <ol className="list-decimal list-inside space-y-1 mt-1">
                  <li>Open your mobile bank app (Uzcard, Humo, etc.).</li>
                  <li>Transfer <b>exactly {amountUzs.toLocaleString()} UZS</b> to the card above.</li>
                  <li>After the transfer is complete, click <b>"I've Sent the Payment"</b> below.</li>
                  <li>Your teacher will verify and activate your plan shortly.</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={onConfirmSent}
              disabled={confirming}
              className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {confirming ? (
                <>
                  <Clock size={16} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Check size={16} />
                  I've Sent the Payment
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
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
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState<{
    plan: "standard" | "pro_vip";
    amountUzs: number;
    orderId: string;
  } | null>(null);
  const [confirmingSent, setConfirmingSent] = useState(false);

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

  /* Step 1: Create order & open transfer instruction modal */
  const handleSubscribe = async (plan: "standard" | "pro_vip") => {
    setProcessingPlan(plan);
    try {
      const order = await createPaymentOrder({
        plan,
        provider: "card_transfer",
      });

      // Open the payment instruction modal
      setPaymentModal({
        plan,
        amountUzs: order.amount_uzs,
        orderId: order.order_id,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create order");
    } finally {
      setProcessingPlan(null);
    }
  };

  /* Step 2: Student confirms they've sent the transfer */
  const handleConfirmSent = async () => {
    setConfirmingSent(true);
    try {
      // Reload data — order is already pending, teacher will verify
      toast.success(
        "✅ Payment submitted! Your teacher will verify and activate your plan shortly.",
        { duration: 6000 }
      );
      setPaymentModal(null);
      await loadData();
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setConfirmingSent(false);
    }
  };

  const currentPlan = premiumStatus?.premium_plan || "free";
  const hasPendingOrder = transactions.some((tx) => tx.status === "pending");

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 sm:p-6">
      {/* Payment Instruction Modal */}
      {paymentModal && (
        <PaymentInstructionModal
          plan={paymentModal.plan}
          amountUzs={paymentModal.amountUzs}
          orderId={paymentModal.orderId}
          onClose={() => setPaymentModal(null)}
          onConfirmSent={handleConfirmSent}
          confirming={confirmingSent}
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
      </div>

      {/* Pending Order Alert */}
      {hasPendingOrder && currentPlan === "free" && (
        <div className="rounded-xl p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 flex items-start gap-2.5 text-xs">
          <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <b>Payment pending verification.</b> You have submitted a transfer that is awaiting teacher confirmation.
            Your premium plan will be activated as soon as it's verified.
          </div>
        </div>
      )}

      {/* Payment Method Info */}
      <div className="rounded-xl p-3.5 bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 flex items-center gap-2.5 text-xs">
        <CreditCard size={18} className="text-blue-600 shrink-0" />
        <span>
          <b>Payment Method:</b> Direct card transfer to the official Uzcard account. No card data is stored on our servers.
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
                <span>⚡ Priority Homework Checking Queue</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => handleSubscribe("standard")}
              disabled={processingPlan !== null || currentPlan === "standard" || currentPlan === "pro_vip"}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                currentPlan === "standard"
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  : currentPlan === "pro_vip"
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  : "btn-primary"
              }`}
            >
              {processingPlan === "standard" ? (
                "Creating order..."
              ) : currentPlan === "standard" ? (
                "Current Plan"
              ) : currentPlan === "pro_vip" ? (
                "You have Pro VIP"
              ) : (
                <>
                  <CreditCard size={14} />
                  Subscribe — Transfer 19,000 UZS
                </>
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
                <span>⚡ Top Priority Teacher Homework Review Queue</span>
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
                "Creating order..."
              ) : currentPlan === "pro_vip" ? (
                "Current Plan"
              ) : (
                <>
                  <CreditCard size={14} />
                  Upgrade to Pro VIP — Transfer 29,000 UZS
                </>
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
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          tx.status === "completed"
                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                            : tx.status === "pending"
                            ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                            : "bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300"
                        }`}
                      >
                        {tx.status === "pending" ? "⏳ Pending Verification" : tx.status}
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
