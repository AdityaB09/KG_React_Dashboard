const DEFAULT_STREAM_URL = "http://localhost:8000/api/stream?provider=oracle&debug=true";

function buildStreamUrl({ provider, patientId } = {}) {
  const baseUrl = import.meta.env.VITE_FHIR_STREAM_URL || DEFAULT_STREAM_URL;
  const url = new URL(baseUrl);

  const selectedProvider = provider || import.meta.env.VITE_FHIR_PROVIDER;
  const selectedPatientId = patientId || import.meta.env.VITE_FHIR_PATIENT_ID;

  if (selectedProvider) {
    url.searchParams.set("provider", selectedProvider);
  }

  if (selectedPatientId) {
    url.searchParams.set("patient_id", selectedPatientId);
  }

  return url.toString();
}

export function connectFhirStream({
  provider,
  patientId,
  onFrame,
  onHeartbeat,
  onError,
}) {
  const eventSource = new EventSource(
    buildStreamUrl({
      provider,
      patientId,
    }),
    {
      withCredentials: true,
    }
  );

  function handleFrame(event) {
    try {
      const frame = JSON.parse(event.data);

      if (import.meta.env.DEV) {
        console.log("FHIR dashboard frame:", frame);

        const fieldDetails = frame.debug?.fieldDetails || {};
        console.table(
          Object.entries(fieldDetails).map(([field, detail]) => ({
            field,
            source: detail.source,
            finalValue: detail.finalValue,
            rawFhirValue: detail.rawFhirValue ?? detail.rawFirelyValue,
            fallbackUsed: detail.fallbackUsed,
            color: detail.color,
            observationId:
              detail.fhirObservation?.observationId ||
              detail.firelyObservation?.observationId ||
              null,
            display:
              detail.fhirObservation?.display ||
              detail.firelyObservation?.display ||
              null,
          }))
        );
      }

      onFrame?.(frame);
    } catch (error) {
      onError?.(error);
    }
  }

  eventSource.addEventListener("fhir-frame", handleFrame);

  // Keep old event name temporarily so nothing breaks while migrating.
  eventSource.addEventListener("firely-frame", handleFrame);

  eventSource.addEventListener("heartbeat", (event) => {
    try {
      onHeartbeat?.(JSON.parse(event.data));
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