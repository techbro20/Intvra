/**
 * PruvoAI is a local personal build. Analytics calls are intentionally no-ops.
 */
export const ANALYTICS_EVENTS = {
  APP_STARTED: "app_started",
  GET_LICENSE: "get_license",
} as const;

export const captureEvent = async (
  _eventName: string,
  _properties?: Record<string, any>
) => {
  return;
};

export const trackAppStart = async (
  _appVersion: string,
  _instanceId: string
) => {
  return;
};
