import { useEffect, useMemo, useRef, useState } from "react";
import { patients, medications, labs, documents, recentSearches } from "./data/mockData";

import Navbar from "./components/Navbar";
import PatientSidebar from "./components/PatientSidebar";
import PatientSummary from "./components/PatientSummary";
import ECGPanel from "./components/ECGPanel";
import WidgetCard from "./components/WidgetCard";
import OverlayModal from "./components/OverlayModal";
import SearchOverlay from "./components/SearchOverlay";
import AlertPanel from "./components/AlertPanel";
import TimelineFeed from "./components/TimelineFeed";

import "./index.css";

import { createInitialTelemetry, nextTelemetryFrame } from "./services/telemetryService";
import { formatCurrentTime, getVitalAlerts } from "./utils/clinicalEvents";

export default function App() {
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0].id);
  const [modal, setModal] = useState(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState([]);

  const searchRef = useRef(null);
  const lastAlertSignatureRef = useRef("");

  const [telemetryMap, setTelemetryMap] = useState(() =>
    Object.fromEntries(
      patients.map((patient) => [
        patient.id,
        createInitialTelemetry(patient.id, patient.risk)
      ])
    )
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryMap((prev) => {
        const updated = {};

        for (const patient of patients) {
          updated[patient.id] = nextTelemetryFrame(prev[patient.id]);
        }

        return updated;
      });
    }, 90);

    return () => clearInterval(interval);
  }, []);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? patients[0],
    [selectedPatientId]
  );

  const selectedTelemetry = telemetryMap[selectedPatientId];

  const activeAlerts = useMemo(
    () => getVitalAlerts(selectedTelemetry),
    [selectedTelemetry]
  );

  useEffect(() => {
    if (!selectedTelemetry) return;

    const signature = activeAlerts.map((alert) => alert.id).join("|");

    if (!signature || signature === lastAlertSignatureRef.current) return;

    lastAlertSignatureRef.current = signature;

    const newEvents = activeAlerts.map((alert) => ({
      id: `${Date.now()}-${alert.id}`,
      patientId: selectedPatientId,
      time: formatCurrentTime(),
      type: alert.level === "critical" ? "Critical Alert" : "Alert",
      level: alert.level,
      title: alert.title,
      message: alert.message
    }));

    setTimelineEvents((prev) => [...newEvents, ...prev].slice(0, 20));
  }, [activeAlerts, selectedTelemetry, selectedPatientId]);

  useEffect(() => {
    setTimelineEvents([
      {
        id: `selected-${Date.now()}`,
        patientId: selectedPatientId,
        time: formatCurrentTime(),
        type: "Patient Selected",
        level: "normal",
        title: `${selectedPatient.name} opened`,
        message: `Live vitals monitoring started for MRN ${selectedPatient.mrn}.`
      }
    ]);

    lastAlertSignatureRef.current = "";
  }, [selectedPatientId]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setGlobalSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  const handleSelectPatient = (id) => {
    setSelectedPatientId(id);
    setModal(null);
    setGlobalSearchOpen(false);
    setGlobalSearchQuery("");
  };

  const openModal = (type) => setModal(type);
  const closeModal = () => setModal(null);

  return (
    <div className={`app-shell ${compactMode ? "compact-mode" : "comfort-mode"}`}>
      <div ref={searchRef}>
        <Navbar
          searchValue={globalSearchQuery}
          alertCount={activeAlerts.length}
          onSearchChange={(value) => {
            setGlobalSearchQuery(value);
            setGlobalSearchOpen(true);
          }}
          onSearchFocus={() => setGlobalSearchOpen(true)}
          onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
        />

        {globalSearchOpen && (
          <SearchOverlay
            patients={patients}
            recentSearches={recentSearches}
            query={globalSearchQuery}
            onClose={() => setGlobalSearchOpen(false)}
            onSelectPatient={handleSelectPatient}
          />
        )}
      </div>

      <div className={`workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <PatientSidebar
          patients={patients}
          selectedPatientId={selectedPatientId}
          onSelectPatient={handleSelectPatient}
          onAddPatient={() => openModal("patient")}
          collapsed={sidebarCollapsed}
        />

        <main className="dashboard-main" aria-label="Patient dashboard">
          <div className="main-toolbar">
            <div>
              <p className="eyebrow">Clinical dashboard</p>
              <h1>{selectedPatient.name}</h1>
            </div>

            <div className="toolbar-actions">
              <button className="ghost-btn" onClick={() => setDarkMode((value) => !value)}>
                {darkMode ? "Light mode" : "Dark mode"}
              </button>

              <button className="ghost-btn" onClick={() => setCompactMode((value) => !value)}>
                {compactMode ? "Comfort view" : "Compact view"}
              </button>

              <button className="primary-btn" onClick={() => openModal("note")}>
                + Add note
              </button>
            </div>
          </div>

          <AlertPanel alerts={activeAlerts} />

          <section className="dashboard-grid priority-two-grid">
            <div className="patient-column">
              <PatientSummary patient={selectedPatient} />
              <ECGPanel telemetry={selectedTelemetry} />
            </div>

            <TimelineFeed events={timelineEvents} />
          </section>

          <section className={`widgets-grid ${compactMode ? "compact" : ""}`}>
            <WidgetCard
              title="Medication Log"
              items={medications}
              kind="medications"
              onAdd={() => openModal("medications")}
              onSeeAll={() => openModal("medications")}
              defaultExpanded={false}
              resetKey={selectedPatientId}
            />

            <WidgetCard
              title="Lab Results"
              items={labs}
              kind="labs"
              onAdd={() => openModal("labs")}
              onSeeAll={() => openModal("labs")}
              defaultExpanded={false}
              resetKey={selectedPatientId}
            />
          </section>

          <WidgetCard
            title="Documents"
            items={documents}
            kind="documents"
            onAdd={() => openModal("documents")}
            onSeeAll={() => openModal("documents")}
            variant="toggled"
            fullWidth
            defaultExpanded={false}
            resetKey={selectedPatientId}
          />
        </main>
      </div>

      {modal && (
        <OverlayModal
          type={modal}
          patient={selectedPatient}
          medications={medications}
          labs={labs}
          documents={documents}
          onClose={closeModal}
        />
      )}
    </div>
  );
}