/**
 * PremiumBadge – renders the emoji badge (👑 / ⭐ / 🕊️) next to a username.
 * Pass `plan` and `custom_badge` from the user's profile.
 */
import { FC } from "react";

interface Props {
  plan?: string | null;
  custom_badge?: string | null;
  className?: string;
}

const PLAN_BADGE: Record<string, string> = {
  pro_vip:  "👑",
  standard: "⭐",
};

export const PremiumBadge: FC<Props> = ({ plan, custom_badge, className = "" }) => {
  const badge = custom_badge || (plan ? PLAN_BADGE[plan] : null);
  if (!badge) return null;
  return (
    <span
      className={`inline-block leading-none select-none ${className}`}
      title={plan === "pro_vip" ? "Pro VIP" : plan === "standard" ? "Standard Premium" : "Premium"}
      aria-label="premium badge"
    >
      {badge}
    </span>
  );
};

export default PremiumBadge;
