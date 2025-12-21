(function () {
  const qs = (sel) => document.querySelector(sel);

  const tripSelect = qs("#tripSelect");
  const activeTripBadge = qs("#activeTripBadge");
  const itemsList = qs("#itemsList");
  const emptyState = qs("#emptyState");

  const btnToggleEdit = qs("#btnToggleEdit");
  let editMode = false;

  const tripMsg = qs("#tripMsg");
  const itemsMsg = qs("#itemsMsg");

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "small mt-2";
    if (type === "ok") el.classList.add("text-success");
    if (type === "err") el.classList.add("text-danger");
    if (type === "info") el.classList.add("text-muted");
  }

  function getActiveTrip() {
    return itemsList?.dataset?.activeTrip || tripSelect?.value || "";
  }

  function setActiveTrip(trip) {
    if (itemsList) itemsList.dataset.activeTrip = trip;
    if (activeTripBadge) activeTripBadge.textContent = trip;
  }

  async function api(url, options) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function updateEmptyState() {
    const hasItems = itemsList && itemsList.querySelectorAll("li").length > 0;
    if (!emptyState) return;
    emptyState.classList.toggle("d-none", hasItems);
  }

  function applyEditModeUI() {
    // Toggle label text + show/hide delete buttons
    if (btnToggleEdit) {
      btnToggleEdit.classList.toggle("btn-outline-secondary", !editMode);
      btnToggleEdit.classList.toggle("btn-secondary", editMode);
      btnToggleEdit.querySelector("span").textContent = editMode ? "Editing" : "Edit";
    }

    if (!itemsList) return;
    itemsList.querySelectorAll("li").forEach((li) => {
      const textSpan = li.querySelector(".item-text");
      const controls = li.querySelector(".edit-controls");

      if (controls) controls.classList.toggle("d-none", !editMode);

      if (textSpan) {
        textSpan.contentEditable = editMode ? "true" : "false";
        textSpan.classList.toggle("border", editMode);
        textSpan.classList.toggle("rounded", editMode);
        textSpan.classList.toggle("px-2", editMode);
        textSpan.classList.toggle("py-1", editMode);
      }
    });
  }

  function buildItemLi(item) {
    const li = document.createElement("li");
    li.className = "list-group-item d-flex align-items-center justify-content-between";
    li.dataset.itemId = item.id;

    const left = document.createElement("div");
    left.className = "d-flex align-items-center gap-2 flex-grow-1";

    const checkbox = document.createElement("input");
    checkbox.className = "form-check-input item-check";
    checkbox.type = "checkbox";
    checkbox.checked = !!item.checked;

    const text = document.createElement("span");
    text.className = "item-text";
    text.dataset.original = item.text;
    text.textContent = item.text;

    left.appendChild(checkbox);
    left.appendChild(text);

    const controls = document.createElement("div");
    controls.className = "edit-controls d-none";

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm btn-outline-danger btn-delete";
    delBtn.type = "button";
    delBtn.title = "Delete item";
    delBtn.innerHTML = '<i class="bi bi-trash"></i>';

    controls.appendChild(delBtn);

    li.appendChild(left);
    li.appendChild(controls);

    // Apply current editMode to new item
    if (editMode) {
      text.contentEditable = "true";
      text.classList.add("border", "rounded", "px-2", "py-1");
      controls.classList.remove("d-none");
    }

    return li;
  }

  // -----------------
  // Trip switching
  // -----------------
  if (tripSelect) {
    tripSelect.addEventListener("change", () => {
      const trip = tripSelect.value;
      // Reload page with selected trip to render items server-side
      window.location.href = `/groceries?trip=${encodeURIComponent(trip)}`;
    });
  }

  // -----------------
  // Create trip
  // -----------------
  const btnCreateTrip = qs("#btnCreateTrip");
  const newTripName = qs("#newTripName");
  if (btnCreateTrip && newTripName) {
    btnCreateTrip.addEventListener("click", async () => {
      const name = newTripName.value.trim();
      setMsg(tripMsg, "", "info");
      if (!name) {
        setMsg(tripMsg, "Trip name is required.", "err");
        return;
      }

      try {
        const data = await api("/api/trips", {
          method: "POST",
          body: JSON.stringify({ trip_name: name }),
        });

        // Add to dropdown and select it
        const opt = document.createElement("option");
        opt.value = data.trip_name;
        opt.textContent = data.trip_name;
        tripSelect.appendChild(opt);
        tripSelect.value = data.trip_name;

        setMsg(tripMsg, `Trip created: ${data.trip_name}`, "ok");
        newTripName.value = "";

        // Navigate to new trip
        window.location.href = `/groceries?trip=${encodeURIComponent(data.trip_name)}`;
      } catch (e) {
        setMsg(tripMsg, e.message, "err");
      }
    });
  }

  // -----------------
  // Add item
  // -----------------
  const btnAddItem = qs("#btnAddItem");
  const itemText = qs("#itemText");

  async function addItem() {
    if (!itemText) return;
    const text = itemText.value.trim();
    const trip = getActiveTrip();
    setMsg(itemsMsg, "", "info");

    if (!text) {
      setMsg(itemsMsg, "Item text is required.", "err");
      return;
    }

    try {
      const data = await api("/api/items", {
        method: "POST",
        body: JSON.stringify({ trip, text }),
      });

      const li = buildItemLi(data.item);
      itemsList.appendChild(li);

      itemText.value = "";
      setMsg(itemsMsg, "Item added.", "ok");
      updateEmptyState();
    } catch (e) {
      setMsg(itemsMsg, e.message, "err");
    }
  }

  if (btnAddItem) btnAddItem.addEventListener("click", addItem);
  if (itemText) {
    itemText.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") addItem();
    });
  }

  // -----------------
  // Toggle edit mode (pencil)
  // -----------------
  if (btnToggleEdit) {
    btnToggleEdit.addEventListener("click", () => {
      editMode = !editMode;
      applyEditModeUI();
    });
  }

  // -----------------
  // Delegate: checkbox change, inline edit save, delete
  // -----------------
  if (itemsList) {
    itemsList.addEventListener("change", async (ev) => {
      const target = ev.target;
      if (!target.classList.contains("item-check")) return;

      const li = target.closest("li");
      const itemId = parseInt(li.dataset.itemId, 10);
      const trip = getActiveTrip();

      try {
        const checked = target.checked;
        const data = await api(`/api/items/${encodeURIComponent(trip)}/${itemId}`, {
          method: "PATCH",
          body: JSON.stringify({ checked }),
        });

        const textSpan = li.querySelector(".item-text");
        if (textSpan) {
          textSpan.classList.toggle("text-decoration-line-through", data.item.checked);
          textSpan.classList.toggle("text-muted", data.item.checked);
        }
      } catch (e) {
        setMsg(itemsMsg, e.message, "err");
        // revert UI if failed
        target.checked = !target.checked;
      }
    });

    // Save inline edits on blur
    itemsList.addEventListener("blur", async (ev) => {
      const target = ev.target;
      if (!target.classList || !target.classList.contains("item-text")) return;

      const li = target.closest("li");
      const itemId = parseInt(li.dataset.itemId, 10);
      const trip = getActiveTrip();
      const newText = target.textContent.trim();
      const original = target.dataset.original || "";

      if (!editMode) return; // only save edits in edit mode
      if (!newText) {
        // Restore original if user clears it
        target.textContent = original;
        return;
      }
      if (newText === original) return;

      try {
        const data = await api(`/api/items/${encodeURIComponent(trip)}/${itemId}`, {
          method: "PATCH",
          body: JSON.stringify({ text: newText }),
        });
        target.dataset.original = data.item.text;
        target.textContent = data.item.text;
        setMsg(itemsMsg, "Item updated.", "ok");
      } catch (e) {
        setMsg(itemsMsg, e.message, "err");
        target.textContent = original;
      }
    }, true);

    // Delete item
    itemsList.addEventListener("click", async (ev) => {
      const btn = ev.target.closest(".btn-delete");
      if (!btn) return;

      const li = btn.closest("li");
      const itemId = parseInt(li.dataset.itemId, 10);
      const trip = getActiveTrip();

      try {
        await api(`/api/items/${encodeURIComponent(trip)}/${itemId}`, {
          method: "DELETE",
        });
        li.remove();
        setMsg(itemsMsg, "Item deleted.", "ok");
        updateEmptyState();
      } catch (e) {
        setMsg(itemsMsg, e.message, "err");
      }
    });
  }

  // Init
  setActiveTrip(itemsList?.dataset?.activeTrip || (tripSelect ? tripSelect.value : ""));
  applyEditModeUI();
  updateEmptyState();
})();
