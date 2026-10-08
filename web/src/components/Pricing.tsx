type Plan = {
  name: string;
  price: string;
  period?: string;
  credits: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
};

const plans: Plan[] = [
  {
    name: "Free",
    price: "$0",
    credits: "20 credits",
    blurb: "Try it on a real interview.",
    features: ["10 AI answers (2 credits each)", "Live listening included", "All core features"],
  },
  {
    name: "Pay as you go",
    price: "$5",
    credits: "100 credits",
    blurb: "Top up only when you need it.",
    features: ["100 AI answers", "Credits never expire", "No subscription"],
  },
  {
    name: "Pro",
    price: "$15",
    period: "/month",
    credits: "600 credits / month",
    blurb: "For an active job search.",
    features: ["600 AI answers every month", "Priority, faster models", "Cancel anytime"],
    highlight: true,
  },
  {
    name: "Lifetime",
    price: "$200",
    period: "one-time",
    credits: "Unlimited with your own API key",
    blurb: "Pay once. Bring your own Groq, OpenAI or other key.",
    features: ["No credit limits", "Lifetime updates", "You pay your AI provider directly"],
  },
];

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 flex-none text-cyan" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Pricing({ downloadUrl }: { downloadUrl: string }) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-2xl p-6 ${
              plan.highlight ? "glow-border bg-panel-2" : "border border-line bg-panel/60"
            }`}
          >
            {plan.highlight && (
              <span className="btn-primary absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </span>
            )}
            <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm text-muted">{plan.blurb}</p>
            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-bold">{plan.price}</span>
              {plan.period && <span className="text-sm text-muted">{plan.period}</span>}
            </div>
            <p className="mt-1 text-sm font-medium text-cyan">{plan.credits}</p>
            <ul className="mt-5 flex flex-1 flex-col gap-2.5 text-sm text-muted">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={downloadUrl}
              className={`mt-6 rounded-full px-4 py-2.5 text-center text-sm font-semibold ${
                plan.highlight ? "btn-primary text-white" : "border border-line text-text hover:border-cyan/50"
              }`}
            >
              Download
            </a>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-muted">
        Create your account in the app. Upgrade anytime from your account — pay by card, with M-Pesa coming soon.
      </p>
    </>
  );
}
