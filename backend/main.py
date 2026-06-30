import asyncio
import json
import math
import os
import random
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

FIRELY_BASE_URL = os.getenv("FIRELY_BASE_URL", "https://server.fire.ly").rstrip("/")
POLL_SECONDS = float(os.getenv("POLL_SECONDS", "1"))
USE_FALLBACK_DEMO_DATA = os.getenv("USE_FALLBACK_DEMO_DATA", "true").lower() == "true"
DEMO_PATIENT_ID = os.getenv("DEMO_PATIENT_ID", "kardiogenics-demo")
DEBUG_FIRELY_LOGS = os.getenv("DEBUG_FIRELY_LOGS", "true").lower() == "true"
MAX_DEBUG_OBSERVATIONS = int(os.getenv("MAX_DEBUG_OBSERVATIONS", "25"))


app = FastAPI(title="KardioGenics Firely Streaming Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


LOINC = {
    "heartRate": ["8867-4"],
    "respiratoryRate": ["9279-1"],
    "spo2": ["2708-6", "59408-5"],
    "temperature": ["8310-5"],
    "systolic": ["8480-6"],
    "diastolic": ["8462-4"],
    "bloodPressurePanel": ["85354-9"],
    "glucose": ["2339-0", "15074-8"],
    "potassium": ["6298-4", "2823-3"],
    "creatinine": ["2160-0", "38483-4"],
    "wbc": ["6690-2", "26464-8"],
}


FIELD_LABELS = {
    "heartRate": "Heart Rate",
    "respiratoryRate": "Respiratory Rate",
    "spo2": "SpO2",
    "systolic": "Systolic BP",
    "diastolic": "Diastolic BP",
    "temperature": "Temperature",
    "glucose": "Glucose",
    "potassium": "Potassium",
    "creatinine": "Creatinine",
    "wbc": "WBC",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_seed() -> float:
    return datetime.now(timezone.utc).timestamp() / max(POLL_SECONDS, 1)


def safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def round_if_present(value: float | None, decimals: int = 0) -> float | int | None:
    if value is None:
        return None
    if decimals == 0:
        return int(round(value))
    return round(value, decimals)


def get_codes(codeable: dict[str, Any] | None) -> set[str]:
    if not codeable:
        return set()

    codes = set()
    for coding in codeable.get("coding", []) or []:
        code = coding.get("code")
        if code:
            codes.add(str(code))

    return codes


def has_any_code(resource_or_component: dict[str, Any], target_codes: list[str]) -> bool:
    codes = get_codes(resource_or_component.get("code"))
    return bool(codes.intersection(set(target_codes)))


def get_quantity_value(resource_or_component: dict[str, Any]) -> float | None:
    quantity = resource_or_component.get("valueQuantity")
    if not isinstance(quantity, dict):
        return None

    return safe_float(quantity.get("value"))

def get_quantity_unit(resource_or_component: dict[str, Any]) -> str | None:
    quantity = resource_or_component.get("valueQuantity")
    if not isinstance(quantity, dict):
        return None

    return quantity.get("unit") or quantity.get("code")


def get_code_display(obs: dict[str, Any]) -> str:
    code = obs.get("code", {}) or {}

    if code.get("text"):
        return str(code["text"])

    coding = code.get("coding", []) or []
    if coding:
        return (
            coding[0].get("display")
            or coding[0].get("code")
            or "Unknown Observation"
        )

    return "Unknown Observation"


def get_subject_reference(obs: dict[str, Any]) -> str | None:
    subject = obs.get("subject")
    if isinstance(subject, dict):
        return subject.get("reference")
    return None


def observation_summary(obs: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": obs.get("id"),
        "resourceType": obs.get("resourceType"),
        "display": get_code_display(obs),
        "codes": sorted(list(get_codes(obs.get("code")))),
        "subject": get_subject_reference(obs),
        "timestamp": get_observation_timestamp(obs),
        "lastUpdated": obs.get("meta", {}).get("lastUpdated"),
        "value": get_quantity_value(obs),
        "unit": get_quantity_unit(obs),
        "componentCount": len(obs.get("component", []) or []),
        "matchedFields": [],
    }


def make_source_detail(
    *,
    field: str,
    obs: dict[str, Any],
    value: float | int,
    unit: str | None,
    component_code: str | None = None,
) -> dict[str, Any]:
    return {
        "field": field,
        "source": "firely",
        "observationId": obs.get("id"),
        "display": get_code_display(obs),
        "codes": sorted(list(get_codes(obs.get("code")))),
        "componentCode": component_code,
        "subject": get_subject_reference(obs),
        "timestamp": get_observation_timestamp(obs),
        "lastUpdated": obs.get("meta", {}).get("lastUpdated"),
        "rawValue": value,
        "unit": unit,
    }


def get_component_quantity_with_source(
    obs: dict[str, Any],
    target_codes: list[str],
) -> tuple[float | None, str | None, str | None]:
    for component in obs.get("component", []) or []:
        if has_any_code(component, target_codes):
            value = get_quantity_value(component)
            unit = get_quantity_unit(component)
            codes = sorted(list(get_codes(component.get("code"))))
            code = codes[0] if codes else None

            if value is not None:
                return value, unit, code

    return None, None, None

def get_observation_timestamp(obs: dict[str, Any]) -> str | None:
    return (
        obs.get("effectiveDateTime")
        or obs.get("issued")
        or obs.get("meta", {}).get("lastUpdated")
    )


def get_component_quantity(obs: dict[str, Any], target_codes: list[str]) -> float | None:
    for component in obs.get("component", []) or []:
        if has_any_code(component, target_codes):
            value = get_quantity_value(component)
            if value is not None:
                return value

    return None


def empty_dashboard_values() -> dict[str, Any]:
    return {
        "heartRate": None,
        "respiratoryRate": None,
        "spo2": None,
        "systolic": None,
        "diastolic": None,
        "temperature": None,
        "glucose": None,
        "potassium": None,
        "creatinine": None,
        "wbc": None,
    }



def extract_dashboard_values(
    bundle: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, str], dict[str, Any], dict[str, Any]]:
    values = empty_dashboard_values()
    timestamps: dict[str, str] = {}
    sources: dict[str, Any] = {}

    entries = bundle.get("entry", []) or []
    observations = [
        entry.get("resource", {})
        for entry in entries
        if entry.get("resource", {}).get("resourceType") == "Observation"
    ]

    scan_report = {
        "bundleType": bundle.get("type"),
        "bundleTotal": bundle.get("total"),
        "entryCount": len(entries),
        "observationCount": len(observations),
        "matchedObservationCount": 0,
        "observationsScanned": [],
    }

    # Firely query is sorted newest first, so first match wins.
    for obs in observations:
        timestamp = get_observation_timestamp(obs)
        summary = observation_summary(obs)

        direct_mappings = [
            ("heartRate", LOINC["heartRate"]),
            ("respiratoryRate", LOINC["respiratoryRate"]),
            ("spo2", LOINC["spo2"]),
            ("temperature", LOINC["temperature"]),
            ("glucose", LOINC["glucose"]),
            ("potassium", LOINC["potassium"]),
            ("creatinine", LOINC["creatinine"]),
            ("wbc", LOINC["wbc"]),
        ]

        for field, codes in direct_mappings:
            if values[field] is None and has_any_code(obs, codes):
                quantity_value = get_quantity_value(obs)
                unit = get_quantity_unit(obs)

                if quantity_value is not None:
                    values[field] = quantity_value

                    if timestamp:
                        timestamps[field] = timestamp

                    sources[field] = make_source_detail(
                        field=field,
                        obs=obs,
                        value=quantity_value,
                        unit=unit,
                    )

                    summary["matchedFields"].append(
                        {
                            "field": field,
                            "matchedCodes": codes,
                            "value": quantity_value,
                            "unit": unit,
                        }
                    )

        if values["systolic"] is None:
            systolic, systolic_unit, component_code = get_component_quantity_with_source(
                obs,
                LOINC["systolic"],
            )

            if systolic is not None:
                values["systolic"] = systolic

                if timestamp:
                    timestamps["systolic"] = timestamp

                sources["systolic"] = make_source_detail(
                    field="systolic",
                    obs=obs,
                    value=systolic,
                    unit=systolic_unit,
                    component_code=component_code,
                )

                summary["matchedFields"].append(
                    {
                        "field": "systolic",
                        "matchedCodes": LOINC["systolic"],
                        "value": systolic,
                        "unit": systolic_unit,
                        "componentCode": component_code,
                    }
                )

        if values["diastolic"] is None:
            diastolic, diastolic_unit, component_code = get_component_quantity_with_source(
                obs,
                LOINC["diastolic"],
            )

            if diastolic is not None:
                values["diastolic"] = diastolic

                if timestamp:
                    timestamps["diastolic"] = timestamp

                sources["diastolic"] = make_source_detail(
                    field="diastolic",
                    obs=obs,
                    value=diastolic,
                    unit=diastolic_unit,
                    component_code=component_code,
                )

                summary["matchedFields"].append(
                    {
                        "field": "diastolic",
                        "matchedCodes": LOINC["diastolic"],
                        "value": diastolic,
                        "unit": diastolic_unit,
                        "componentCode": component_code,
                    }
                )

        if summary["matchedFields"]:
            scan_report["matchedObservationCount"] += 1

        if len(scan_report["observationsScanned"]) < MAX_DEBUG_OBSERVATIONS:
            scan_report["observationsScanned"].append(summary)

    return values, timestamps, sources, scan_report


def fallback_demo_values() -> dict[str, Any]:
    """
    This keeps your dashboard moving even when the public sandbox does not
    contain every Observation your UI needs.
    """
    t = now_seed()

    heart_rate = 118 + math.sin(t / 2.0) * 30 + random.uniform(-5, 5)
    respiratory_rate = 24 + math.sin(t / 3.0) * 8 + random.uniform(-2, 2)
    spo2 = 96 + math.sin(t / 4.0) * 3 + random.uniform(-1, 1)
    systolic = 128 + math.sin(t / 5.0) * 10 + random.uniform(-3, 3)
    diastolic = 82 + math.sin(t / 5.3) * 7 + random.uniform(-2, 2)
    temperature = 37.1 + math.sin(t / 6.0) * 0.35 + random.uniform(-0.1, 0.1)
    glucose = 190 + math.sin(t / 2.5) * 42 + random.uniform(-8, 8)
    potassium = 5.15 + math.sin(t / 3.3) * 0.38 + random.uniform(-0.08, 0.08)
    creatinine = 1.25 + math.sin(t / 4.2) * 0.25 + random.uniform(-0.04, 0.04)
    wbc = 11.2 + math.sin(t / 3.7) * 1.2 + random.uniform(-0.2, 0.2)

    return {
        "heartRate": round(heart_rate),
        "respiratoryRate": round(respiratory_rate),
        "spo2": round(max(88, min(100, spo2))),
        "systolic": round(systolic),
        "diastolic": round(diastolic),
        "temperature": round(temperature, 1),
        "glucose": round(glucose),
        "potassium": round(potassium, 1),
        "creatinine": round(creatinine, 2),
        "wbc": round(wbc, 1),
    }


def fill_missing_values(values: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    if not USE_FALLBACK_DEMO_DATA:
        return values, [key for key, value in values.items() if value is None]

    fallback = fallback_demo_values()
    fallback_used = []

    merged = {}
    for key, fallback_value in fallback.items():
        if values.get(key) is None:
            merged[key] = fallback_value
            fallback_used.append(key)
        else:
            merged[key] = values[key]

    return merged, fallback_used


def build_field_debug(
    *,
    raw_values: dict[str, Any],
    final_values: dict[str, Any],
    colors: dict[str, str],
    fallback_used: list[str],
    timestamps: dict[str, str],
    sources: dict[str, Any],
) -> dict[str, Any]:
    details = {}

    for field, label in FIELD_LABELS.items():
        came_from_firely = raw_values.get(field) is not None
        came_from_fallback = field in fallback_used

        if came_from_firely:
            source_type = "firely"
        elif came_from_fallback:
            source_type = "fallback"
        else:
            source_type = "missing"

        details[field] = {
            "label": label,
            "source": source_type,
            "finalValue": final_values.get(field),
            "rawFirelyValue": raw_values.get(field),
            "fallbackUsed": came_from_fallback,
            "timestamp": timestamps.get(field),
            "color": colors.get(field),
            "firelyObservation": sources.get(field),
        }

    return details

def classify_field(field: str, value: float | int | None) -> str:
    if value is None:
        return "yellow"

    if field == "heartRate":
        if value >= 125 or value <= 45:
            return "red"
        if value >= 105 or value <= 55:
            return "yellow"
        return "blue"

    if field == "respiratoryRate":
        if value >= 30 or value <= 8:
            return "red"
        if value >= 24 or value <= 11:
            return "yellow"
        return "blue"

    if field == "spo2":
        if value <= 90:
            return "red"
        if value <= 94:
            return "yellow"
        return "blue"

    if field == "temperature":
        if value >= 38.5 or value <= 35.0:
            return "red"
        if value >= 37.8 or value <= 36.0:
            return "yellow"
        return "blue"

    if field == "glucose":
        if value >= 220 or value <= 55:
            return "red"
        if value >= 180 or value <= 70:
            return "yellow"
        return "blue"

    if field == "potassium":
        if value >= 5.5 or value <= 3.0:
            return "red"
        if value >= 5.1 or value <= 3.4:
            return "yellow"
        return "blue"

    if field == "creatinine":
        if value >= 1.45:
            return "red"
        if value >= 1.25:
            return "yellow"
        return "blue"

    if field == "wbc":
        if value >= 12.0 or value <= 3.0:
            return "red"
        if value >= 11.0 or value <= 4.0:
            return "yellow"
        return "blue"

    if field in ["systolic", "diastolic"]:
        if field == "systolic":
            if value >= 180 or value <= 80:
                return "red"
            if value >= 140 or value <= 90:
                return "yellow"
            return "blue"

        if field == "diastolic":
            if value >= 120 or value <= 45:
                return "red"
            if value >= 90 or value <= 55:
                return "yellow"
            return "blue"

    return "blue"


def overall_color(colors: dict[str, str]) -> str:
    rank = {"blue": 0, "yellow": 1, "red": 2}
    worst = "blue"

    for color in colors.values():
        if rank[color] > rank[worst]:
            worst = color

    return worst


def build_interpretation(values: dict[str, Any], colors: dict[str, str], color: str) -> dict[str, str]:
    hr = values["heartRate"]
    rr = values["respiratoryRate"]
    spo2 = values["spo2"]
    glucose = values["glucose"]
    potassium = values["potassium"]
    creatinine = values["creatinine"]
    wbc = values["wbc"]

    if color == "red":
        title = "(!) Critical abnormalities detected"
    elif color == "yellow":
        title = "(!) Warning abnormalities detected"
    else:
        title = "No critical abnormalities detected"

    rhythm_triggers = []

    if colors["heartRate"] == "red":
        rhythm_triggers.append(f"heart rate is critical at {hr} bpm")
    elif colors["heartRate"] == "yellow":
        rhythm_triggers.append(f"heart rate is in warning range at {hr} bpm")

    if colors["potassium"] == "red":
        rhythm_triggers.append(f"potassium is critical at {potassium} mmol/L")
    elif colors["potassium"] == "yellow":
        rhythm_triggers.append(f"potassium is elevated at {potassium} mmol/L")

    if rhythm_triggers:
        rhythm = (
            "Latest Firely-derived values show "
            + " and ".join(rhythm_triggers)
            + ". Review ECG rhythm pattern for peaked T waves, QRS widening, and rhythm instability."
        )
    else:
        rhythm = (
            f"Heart rate is {hr} bpm and potassium is {potassium} mmol/L. "
            "No critical rhythm trigger is active in the current demo rules."
        )

    if colors["spo2"] == "red":
        ppg = (
            f"SpO2 is critically low at {spo2}%. Review PPG waveform quality, respiratory status, "
            "and possible oxygenation compromise."
        )
    elif colors["spo2"] == "yellow":
        ppg = (
            f"SpO2 is in warning range at {spo2}%. Continue monitoring pulse oximetry trend and waveform quality."
        )
    else:
        ppg = (
            f"SpO2 is {spo2}%. PPG-derived oxygenation is acceptable by the current demo thresholds."
        )

    likely = (
        f"Latest stream values show glucose {glucose}, potassium {potassium}, "
        f"creatinine {creatinine}, WBC {wbc}, respiratory rate {rr}, and SpO2 {spo2}. "
        "This is rule-based demo clinical decision support, not a production diagnosis."
    )

    return {
        "title": title,
        "rhythm": rhythm,
        "ppg": ppg,
        "likelyEtiology": likely,
    }


async def fetch_firely_observations(patient_id: str | None = None) -> dict[str, Any]:
    params = {
        "_sort": "-_lastUpdated",
        "_count": "200",
    }

    if patient_id:
        params["subject"] = f"Patient/{patient_id}"

    async with httpx.AsyncClient(timeout=15) as client:
        if DEBUG_FIRELY_LOGS:
            print("\n[FIRELY REQUEST]")
            print("URL:", f"{FIRELY_BASE_URL}/Observation")
            print("PARAMS:", params)

        response = await client.get(
            f"{FIRELY_BASE_URL}/Observation",
            params=params,
            headers={"Accept": "application/fhir+json"},
        )

        if DEBUG_FIRELY_LOGS:
            print("[FIRELY RESPONSE]")
            print("STATUS:", response.status_code)
            print("FINAL URL:", str(response.url))

        response.raise_for_status()
        bundle = response.json()

        if DEBUG_FIRELY_LOGS:
            print("BUNDLE TYPE:", bundle.get("type"))
            print("BUNDLE TOTAL:", bundle.get("total"))
            print("ENTRY COUNT:", len(bundle.get("entry", []) or []))

        return bundle

def to_dashboard_frame(bundle: dict[str, Any], include_debug: bool = False) -> dict[str, Any]:
    raw_values, timestamps, sources, scan_report = extract_dashboard_values(bundle)
    values, fallback_used = fill_missing_values(raw_values)

    values = {
        "heartRate": round_if_present(values["heartRate"], 0),
        "respiratoryRate": round_if_present(values["respiratoryRate"], 0),
        "spo2": round_if_present(values["spo2"], 0),
        "systolic": round_if_present(values["systolic"], 0),
        "diastolic": round_if_present(values["diastolic"], 0),
        "temperature": round_if_present(values["temperature"], 1),
        "glucose": round_if_present(values["glucose"], 0),
        "potassium": round_if_present(values["potassium"], 1),
        "creatinine": round_if_present(values["creatinine"], 2),
        "wbc": round_if_present(values["wbc"], 1),
    }

    colors = {
        field: classify_field(field, value)
        for field, value in values.items()
    }

    alert_relevant_colors = {
        key: color
        for key, color in colors.items()
        if key not in ["systolic", "diastolic", "temperature"]
    }

    color = overall_color(alert_relevant_colors)
    interpretation = build_interpretation(values, colors, color)

    latest_timestamp = (
        max(timestamps.values())
        if timestamps
        else now_iso()
    )

    firely_fields = [
        field
        for field, value in raw_values.items()
        if value is not None
    ]

    missing_raw_fields = [
        field
        for field, value in raw_values.items()
        if value is None
    ]

    field_debug = build_field_debug(
        raw_values=raw_values,
        final_values=values,
        colors=colors,
        fallback_used=fallback_used,
        timestamps=timestamps,
        sources=sources,
    )

    frame = {
        "source": "firely-public-sandbox",
        "status": "connected",
        "timestamp": latest_timestamp,
        "receivedAt": now_iso(),
        "overallColor": color,

        # Quick summary for frontend/devtools.
        "dataQuality": {
            "firelyFieldCount": len(firely_fields),
            "fallbackFieldCount": len(fallback_used),
            "firelyFields": firely_fields,
            "fallbackFields": fallback_used,
            "missingRawFirelyFields": missing_raw_fields,
            "observationCount": scan_report["observationCount"],
            "matchedObservationCount": scan_report["matchedObservationCount"],
        },

        # Kept for existing frontend compatibility.
        "fallbackUsed": fallback_used,

        "vitals": {
            "heartRate": values["heartRate"],
            "respiratoryRate": values["respiratoryRate"],
            "spo2": values["spo2"],
            "systolic": values["systolic"],
            "diastolic": values["diastolic"],
            "temperature": values["temperature"],
        },
        "labs": {
            "glucose": values["glucose"],
            "potassium": values["potassium"],
            "creatinine": values["creatinine"],
            "wbc": values["wbc"],
        },
        "colors": colors,
        "interpretation": interpretation,
    }

    if include_debug:
        frame["debug"] = {
            "rawExtractedFirelyValues": raw_values,
            "finalDashboardValues": values,
            "fieldDetails": field_debug,
            "firelyScan": scan_report,
        }

    if DEBUG_FIRELY_LOGS:
        print("[DASHBOARD FRAME]")
        print("Firely fields:", firely_fields)
        print("Fallback fields:", fallback_used)
        print("Overall color:", color)

    return frame


@app.get("/health")
async def health():
    return {
        "ok": True,
        "firelyBaseUrl": FIRELY_BASE_URL,
        "pollSeconds": POLL_SECONDS,
        "fallbackDemoData": USE_FALLBACK_DEMO_DATA,
    }


@app.get("/api/firely/raw")
async def raw_firely_observations(patient_id: str | None = Query(default=None)):
    return await fetch_firely_observations(patient_id)


@app.get("/api/firely/latest")
async def latest_firely_frame(
    patient_id: str | None = Query(default=None),
    debug: bool = Query(default=False),
):
    bundle = await fetch_firely_observations(patient_id)
    return to_dashboard_frame(bundle, include_debug=debug)


@app.get("/api/firely/debug/latest")
async def latest_firely_debug_frame(patient_id: str | None = Query(default=None)):
    bundle = await fetch_firely_observations(patient_id)
    return to_dashboard_frame(bundle, include_debug=True)



@app.get("/api/firely/stream")
async def stream_firely_frame(
    patient_id: str | None = Query(default=None),
    debug: bool = Query(default=False),
):
    async def event_generator():
        last_payload = None

        while True:
            try:
                bundle = await fetch_firely_observations(patient_id)
                frame = to_dashboard_frame(bundle, include_debug=debug)
                payload = json.dumps(frame, separators=(",", ":"))

                if payload != last_payload:
                    last_payload = payload
                    yield "event: firely-frame\n"
                    yield f"data: {payload}\n\n"
                else:
                    heartbeat = {
                        "status": "heartbeat",
                        "receivedAt": now_iso(),
                    }
                    yield "event: heartbeat\n"
                    yield f"data: {json.dumps(heartbeat)}\n\n"

            except Exception as error:
                error_frame = {
                    "source": "firely-public-sandbox",
                    "status": "error",
                    "timestamp": now_iso(),
                    "receivedAt": now_iso(),
                    "overallColor": "yellow",
                    "error": str(error),
                    "vitals": {},
                    "labs": {},
                    "colors": {},
                    "dataQuality": {
                        "firelyFieldCount": 0,
                        "fallbackFieldCount": 0,
                        "firelyFields": [],
                        "fallbackFields": [],
                        "missingRawFirelyFields": list(FIELD_LABELS.keys()),
                        "observationCount": 0,
                        "matchedObservationCount": 0,
                    },
                    "interpretation": {
                        "title": "Firely stream warning",
                        "rhythm": "The backend could not fetch the latest Firely Observations.",
                        "ppg": "The dashboard can continue showing local waveform simulation.",
                        "likelyEtiology": "Check backend logs, Firely availability, network access, or patient_id filtering.",
                    },
                }

                yield "event: firely-frame\n"
                yield f"data: {json.dumps(error_frame)}\n\n"

            await asyncio.sleep(POLL_SECONDS)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
    
    
    
def observation_category(kind: str) -> list[dict[str, Any]]:
    code = "laboratory" if kind == "lab" else "vital-signs"
    display = "Laboratory" if kind == "lab" else "Vital Signs"

    return [
        {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                    "code": code,
                    "display": display,
                }
            ]
        }
    ]


def make_quantity_observation(
    *,
    code: str,
    display: str,
    value: float | int,
    unit: str,
    ucum_code: str,
    kind: str,
    patient_id: str,
) -> dict[str, Any]:
    return {
        "resourceType": "Observation",
        "status": "final",
        "category": observation_category(kind),
        "subject": {
            "reference": f"Patient/{patient_id}",
        },
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": code,
                    "display": display,
                }
            ],
            "text": display,
        },
        "effectiveDateTime": now_iso(),
        "valueQuantity": {
            "value": value,
            "unit": unit,
            "system": "http://unitsofmeasure.org",
            "code": ucum_code,
        },
    }


def make_bp_observation(patient_id: str, systolic: int, diastolic: int) -> dict[str, Any]:
    return {
        "resourceType": "Observation",
        "status": "final",
        "category": observation_category("vital"),
        "subject": {
            "reference": f"Patient/{patient_id}",
        },
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "85354-9",
                    "display": "Blood pressure panel with all children optional",
                }
            ],
            "text": "Blood pressure",
        },
        "effectiveDateTime": now_iso(),
        "component": [
            {
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "8480-6",
                            "display": "Systolic blood pressure",
                        }
                    ],
                    "text": "Systolic blood pressure",
                },
                "valueQuantity": {
                    "value": systolic,
                    "unit": "mmHg",
                    "system": "http://unitsofmeasure.org",
                    "code": "mm[Hg]",
                },
            },
            {
                "code": {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": "8462-4",
                            "display": "Diastolic blood pressure",
                        }
                    ],
                    "text": "Diastolic blood pressure",
                },
                "valueQuantity": {
                    "value": diastolic,
                    "unit": "mmHg",
                    "system": "http://unitsofmeasure.org",
                    "code": "mm[Hg]",
                },
            },
        ],
    }


async def ensure_demo_patient(client: httpx.AsyncClient, patient_id: str) -> None:
    patient = {
        "resourceType": "Patient",
        "id": patient_id,
        "identifier": [
            {
                "system": "https://kardiogenics.local/demo",
                "value": patient_id,
            }
        ],
        "name": [
            {
                "family": "Abbott",
                "given": ["Leslie"],
            }
        ],
        "gender": "female",
        "birthDate": "1946-08-22",
    }

    try:
        await client.put(
            f"{FIRELY_BASE_URL}/Patient/{patient_id}",
            json=patient,
            headers={
                "Content-Type": "application/fhir+json",
                "Accept": "application/fhir+json",
            },
        )
    except Exception:
        # Public sandbox behavior can vary. The Observations can still be posted.
        pass


@app.post("/api/firely/seed-demo-observations")
async def seed_demo_observations(patient_id: str = Query(default=DEMO_PATIENT_ID)):
    values = fallback_demo_values()

    observations = [
        make_quantity_observation(
            code="8867-4",
            display="Heart rate",
            value=values["heartRate"],
            unit="beats/minute",
            ucum_code="/min",
            kind="vital",
            patient_id=patient_id,
        ),
        make_quantity_observation(
            code="9279-1",
            display="Respiratory rate",
            value=values["respiratoryRate"],
            unit="breaths/minute",
            ucum_code="/min",
            kind="vital",
            patient_id=patient_id,
        ),
        make_quantity_observation(
            code="2708-6",
            display="Oxygen saturation in Arterial blood",
            value=values["spo2"],
            unit="%",
            ucum_code="%",
            kind="vital",
            patient_id=patient_id,
        ),
        make_quantity_observation(
            code="8310-5",
            display="Body temperature",
            value=values["temperature"],
            unit="Cel",
            ucum_code="Cel",
            kind="vital",
            patient_id=patient_id,
        ),
        make_bp_observation(
            patient_id=patient_id,
            systolic=values["systolic"],
            diastolic=values["diastolic"],
        ),
        make_quantity_observation(
            code="2339-0",
            display="Glucose",
            value=values["glucose"],
            unit="mg/dL",
            ucum_code="mg/dL",
            kind="lab",
            patient_id=patient_id,
        ),
        make_quantity_observation(
            code="6298-4",
            display="Potassium",
            value=values["potassium"],
            unit="mmol/L",
            ucum_code="mmol/L",
            kind="lab",
            patient_id=patient_id,
        ),
        make_quantity_observation(
            code="2160-0",
            display="Creatinine",
            value=values["creatinine"],
            unit="mg/dL",
            ucum_code="mg/dL",
            kind="lab",
            patient_id=patient_id,
        ),
        make_quantity_observation(
            code="6690-2",
            display="Leukocytes",
            value=values["wbc"],
            unit="10*3/uL",
            ucum_code="10*3/uL",
            kind="lab",
            patient_id=patient_id,
        ),
    ]

    created = []

    async with httpx.AsyncClient(timeout=15) as client:
        await ensure_demo_patient(client, patient_id)

        for observation in observations:
            response = await client.post(
                f"{FIRELY_BASE_URL}/Observation",
                json=observation,
                headers={
                    "Content-Type": "application/fhir+json",
                    "Accept": "application/fhir+json",
                },
            )

            if response.status_code >= 400:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.text,
                )

            created.append(response.json())

    return {
        "patientId": patient_id,
        "created": len(created),
        "values": values,
    }