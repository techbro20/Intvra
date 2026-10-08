import { AIProviders, STTProviders } from "./components";
import { useSettings } from "@/hooks";
import { useAuth } from "@/hooks/useAuth";
import { usesCloud } from "@/lib/cloud";
import { PageLayout } from "@/layouts";

const DevSpace = () => {
  const settings = useSettings();
  const auth = useAuth();

  return (
    <PageLayout
      title="Provider Matrix"
      description="Configure AI and speech providers with your own endpoint, API key, model name, headers, and response paths."
    >
      {usesCloud(auth) ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
          Your plan answers through Ai.Intvra Cloud using your credits, so no API key is needed. Keys added here are
          only used on the Lifetime plan.
        </div>
      ) : null}

      {/* Provider Selection */}
      <AIProviders {...settings} />

      {/* STT Providers */}
      <STTProviders {...settings} />
    </PageLayout>
  );
};

export default DevSpace;
