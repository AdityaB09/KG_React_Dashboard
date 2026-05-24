import { useMemo, useState } from "react";
import { patients, medications, labs, documents, recentSearches } from "./data/mockData";
import Navbar from "./components/Navbar";
import PatientSidebar from "./components/PatientSidebar";
import PatientSummary from "./components/PatientSummary";
import ECGPanel from "./components/ECGPanel";
import WidgetCard from "./components/WidgetCard";
import OverlayModal from "./components/OverlayModal";
import SearchOverlay from "./components/SearchOverlay";
import "./index.css";

export default function App() {
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0].id);
  const [modal, setModal] = useState(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? patients[0],
    [selectedPatientId]
  );

  const openModal = (type) => setModal(type);
  const closeModal = () => setModal(null);

  return (
    <div className="app-shell">
      <Navbar
  searchValue={globalSearchQuery}
  onSearchChange={(value) => {
    setGlobalSearchQuery(value);
    setGlobalSearchOpen(true);
  }}
  onSearchFocus={() => setGlobalSearchOpen(true)}
  onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
/>

      <div className={`workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <PatientSidebar
  patients={patients}
  selectedPatientId={selectedPatientId}
  onSelectPatient={setSelectedPatientId}
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
              <button className="ghost-btn" onClick={() => setCompactMode((value) => !value)}>
                {compactMode ? "Comfort view" : "Compact view"}
              </button>
              <button className="primary-btn" onClick={() => openModal("note")}>+ Add note</button>
            </div>
          </div>

          <section className="dashboard-grid">
            <div className="patient-column">
              <PatientSummary patient={selectedPatient} />
              <ECGPanel />
            </div>

            <aside className="quick-actions-panel">
              <button className="quick-option active">Option 01</button>
              <button className="quick-option">Option 02</button>
              <button className="quick-option">Option 03</button>
              <button className="quick-option">Option 05</button>
              <button className="quick-option">Option 07</button>
            </aside>
          </section>

          <section className={`widgets-grid ${compactMode ? "compact" : ""}`}>
       <WidgetCard
  title="Medication Log"
  items={medications}
  kind="medications"
  onAdd={() => openModal("medications")}
  onSeeAll={() => openModal("medications")}
  defaultExpanded={false}
/>

<WidgetCard
  title="Lab Results"
  items={labs}
  kind="labs"
  onAdd={() => openModal("labs")}
  onSeeAll={() => openModal("labs")}
  defaultExpanded={true}
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
/>
        </main>
      </div>

     {globalSearchOpen && (
  <SearchOverlay
    patients={patients}
    recentSearches={recentSearches}
    query={globalSearchQuery}
    setQuery={setGlobalSearchQuery}
    onClose={() => setGlobalSearchOpen(false)}
    onSelectPatient={(id) => {
      setSelectedPatientId(id);
      setGlobalSearchOpen(false);
      setGlobalSearchQuery("");
    }}
/>
      )}

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
