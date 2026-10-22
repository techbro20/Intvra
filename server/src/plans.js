export const PAID_PLANS = {
  payg: {
    name: "Pay as you go",
    usd: 5,
    credits: 150,
    summary: "150 credits. They never expire.",
  },
  pro: {
    name: "Pro",
    usd: 15,
    credits: 700,
    days: 30,
    summary: "700 credits for 30 days. Renew whenever you like.",
  },
  lifetime: {
    name: "Lifetime",
    usd: 200,
    summary: "Pay once and use your own API key forever.",
  },
};

export const isPaidPlan = (plan) => Object.hasOwn(PAID_PLANS, plan);

/** Why a user can't buy a plan, or "" if they can. */
export function purchaseBlockedReason(user, plan) {
  if (!isPaidPlan(plan)) return "Choose a plan.";
  if (user.plan === "lifetime") return "You already have Lifetime, so there's nothing more to buy.";
  if (user.is_admin) return "Admin accounts use their own API keys and don't need a plan.";
  return "";
}
