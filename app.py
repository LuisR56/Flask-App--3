from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, List

from flask import Flask, jsonify, render_template, request

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "groceries.json")

app = Flask(__name__)


def _ensure_data_file() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DATA_FILE):
        seed = {
            "trips": {
                "Default Trip": []
            },
            "last_updated": datetime.utcnow().isoformat()
        }
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(seed, f, indent=2)


def _load_data() -> Dict[str, Any]:
    _ensure_data_file()
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_data(data: Dict[str, Any]) -> None:
    data["last_updated"] = datetime.utcnow().isoformat()
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _new_item_id(trip_items: List[Dict[str, Any]]) -> int:
    # Simple incremental integer IDs per-trip.
    # If items deleted, this still ensures uniqueness by using max+1.
    if not trip_items:
        return 1
    return max(int(x.get("id", 0)) for x in trip_items) + 1


@app.route("/")
def index():
    data = _load_data()
    trips = data.get("trips", {})
    return render_template("index.html", trips=trips)


@app.route("/groceries")
def groceries():
    data = _load_data()
    trips = data.get("trips", {})
    trip_names = sorted(trips.keys()) if trips else ["Default Trip"]
    active_trip = request.args.get("trip") or (trip_names[0] if trip_names else "Default Trip")
    if active_trip not in trips:
        active_trip = trip_names[0] if trip_names else "Default Trip"

    return render_template(
        "groceries.html",
        trips=trips,
        trip_names=trip_names,
        active_trip=active_trip,
        items=trips.get(active_trip, []),
    )


# -----------------------
# API (JSON) endpoints
# -----------------------

@app.route("/api/trips", methods=["POST"])
def api_create_trip():
    payload = request.get_json(silent=True) or {}
    trip_name = str(payload.get("trip_name", "")).strip()

    if not trip_name:
        return jsonify({"ok": False, "error": "Trip name is required."}), 400

    data = _load_data()
    trips = data.setdefault("trips", {})

    if trip_name in trips:
        return jsonify({"ok": False, "error": "Trip already exists."}), 400

    trips[trip_name] = []
    _save_data(data)
    return jsonify({"ok": True, "trip_name": trip_name})


@app.route("/api/items", methods=["POST"])
def api_add_item():
    payload = request.get_json(silent=True) or {}
    trip = str(payload.get("trip", "")).strip()
    text = str(payload.get("text", "")).strip()

    if not trip:
        return jsonify({"ok": False, "error": "Trip is required."}), 400
    if not text:
        return jsonify({"ok": False, "error": "Item text is required."}), 400

    data = _load_data()
    trips = data.setdefault("trips", {})
    items = trips.setdefault(trip, [])

    item = {
        "id": _new_item_id(items),
        "text": text,
        "checked": False,
        "created_at": datetime.utcnow().isoformat(),
    }
    items.append(item)
    _save_data(data)
    return jsonify({"ok": True, "item": item})


@app.route("/api/items/<trip>/<int:item_id>", methods=["PATCH"])
def api_update_item(trip: str, item_id: int):
    payload = request.get_json(silent=True) or {}
    data = _load_data()
    trips = data.get("trips", {})

    if trip not in trips:
        return jsonify({"ok": False, "error": "Trip not found."}), 404

    items = trips[trip]
    target = next((x for x in items if int(x.get("id", 0)) == item_id), None)
    if not target:
        return jsonify({"ok": False, "error": "Item not found."}), 404

    # Allowed updates
    if "checked" in payload:
        target["checked"] = bool(payload["checked"])
    if "text" in payload:
        new_text = str(payload["text"]).strip()
        if not new_text:
            return jsonify({"ok": False, "error": "Text cannot be empty."}), 400
        target["text"] = new_text

    target["updated_at"] = datetime.utcnow().isoformat()
    _save_data(data)
    return jsonify({"ok": True, "item": target})


@app.route("/api/items/<trip>/<int:item_id>", methods=["DELETE"])
def api_delete_item(trip: str, item_id: int):
    data = _load_data()
    trips = data.get("trips", {})

    if trip not in trips:
        return jsonify({"ok": False, "error": "Trip not found."}), 404

    items = trips[trip]
    before = len(items)
    items[:] = [x for x in items if int(x.get("id", 0)) != item_id]

    if len(items) == before:
        return jsonify({"ok": False, "error": "Item not found."}), 404

    _save_data(data)
    return jsonify({"ok": True})


if __name__ == "__main__":
    _ensure_data_file()
    app.run(debug=True)
