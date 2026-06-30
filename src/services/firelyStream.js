const DEFAULT_STREAM_URL = "http://localhost:8000/api/firely/stream";

function buildStreamUrl() {
  const baseUrl = import.meta.env.VITE_FIRELY_STREAM_URL || DEFAULT_STREAM_URL;
  const patientId = import.meta.env.VITE_FIRELY_PATIENT_ID;

  if (!patientId) return baseUrl;

  const url = new URL(baseUrl);
  url.searchParams.set("patient_id", patientId);
  return url.toString();
}

export function connectFirelyStream({ onFrame, onHeartbeat, onError }) {
  const eventSource = new EventSource(buildStreamUrl());

 eventSource.addEventListener("firely-frame", (event) => {
  try {
    const frame = JSON.parse(event.data);

    console.log("Firely dashboard frame:", frame);
    console.table(
      Object.entries(frame.debug?.fieldDetails || {}).map(([field, detail]) => ({
        field,
        source: detail.source,
        finalValue: detail.finalValue,
        rawFirelyValue: detail.rawFirelyValue,
        fallbackUsed: detail.fallbackUsed,
        color: detail.color,
        observationId: detail.firelyObservation?.observationId || null,
        display: detail.firelyObservation?.display || null,
      }))
    );

    onFrame?.(frame);
  } catch (error) {
    onError?.(error);
  }
});

  eventSource.addEventListener("heartbeat", (event) => {
    try {
      const heartbeat = JSON.parse(event.data);
      onHeartbeat?.(heartbeat);
    } catch {
      onHeartbeat?.({ status: "heartbeat" });
    }
  });

  eventSource.onerror = (error) => {
    onError?.(error);
  };

  return () => {
    eventSource.close();
  };
}
