import { Navigate } from "react-router-dom";
import { AIProviders, STTProviders } from "./components";
import { useSettings } from "@/hooks";
import { useAuth } from "@/hooks/useAuth";
import { PageLayout } from "@/layouts";

const DevSpace = () => {
  const settings = useSettings();
  const auth = useAuth();

  if (!auth?.user?.byok) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <PageLayout
      title="Provider Matrix"
      description="Configure AI and speech providers with your own endpoint, API key, model name, headers, and response paths."
    >
      <AIProviders {...settings} />
      <STTProviders {...settings} />
    </PageLayout>
  );
};

export default DevSpace;
