import {
  listSnapshots,
  removeSnapshot,
  decryptSnapshot,
  decodeDocument,
} from "./offline-store.js";
const downloads = document.getElementById("downloads"),
  content = document.getElementById("content"),
  message = document.getElementById("message");
let objectUrls = [];
function element(tag, text, parent) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = String(text);
  if (parent) parent.append(item);
  return item;
}
function lock() {
  content.replaceChildren();
  content.hidden = true;
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  downloads.hidden = false;
}
function button(text, parent, action) {
  const item = element("button", text, parent);
  item.type = "button";
  item.addEventListener("click", action);
  return item;
}
function render(snapshot) {
  lock();
  downloads.hidden = true;
  content.hidden = false;
  element("h2", snapshot.trip.name, content);
  element(
    "p",
    "Downloaded " +
      new Date(snapshot.downloadedAt).toLocaleString() +
      ". Changes made since then are not included.",
    content,
  ).className = "notice";
  element(
    "p",
    snapshot.trip.start_date +
      " → " +
      snapshot.trip.end_date +
      " · " +
      snapshot.trip.timezone,
    content,
  );
  button("Lock this copy", content, lock);
  for (const [title, items] of [
    ["Itinerary", snapshot.trip_segments],
    ["Bookings", snapshot.bookings],
  ]) {
    element("h2", title, content);
    if (!items?.length)
      element("p", "Nothing saved in this download.", content);
    for (const item of items || []) {
      const card = element("article", undefined, content);
      element("h3", item.title, card);
      element(
        "p",
        [
          item.start_date,
          item.local_time,
          item.timezone,
          item.end_date !== item.start_date ? "→ " + item.end_date : "",
          item.status || item.verification,
        ]
          .filter(Boolean)
          .join(" · "),
        card,
      );
      for (const [label, key] of [
        ["Address", "address"],
        ["Provider", "provider"],
        ["Reference", "reference"],
        ["From", "origin"],
        ["To", "destination"],
        ["Arrival", "arrival_location"],
        ["Arrival time", "arrival_time"],
        ["Arrival zone", "arrival_timezone"],
        ["End time", "end_local_time"],
        ["End zone", "end_timezone"],
        ["Notes", "notes"],
      ])
        if (item[key]) element("p", label + ": " + item[key], card);
    }
  }
  element("h2", "Preparation", content);
  const prep = element("ul", undefined, content);
  for (const item of snapshot.prep_tasks || [])
    element(
      "li",
      (item.done ? "Done: " : "Open: ") +
        item.title +
        (item.due_date ? " · due " + item.due_date : ""),
      prep,
    );
  element("h2", "Packing", content);
  for (const list of snapshot.packing_lists || []) {
    element("h3", list.traveler, content);
    const rows = element("ul", undefined, content);
    for (const item of (snapshot.packing_items || []).filter(
      (item) => item.list_id === list.id,
    ))
      element(
        "li",
        (item.packed ? "Packed: " : "To pack: ") +
          item.quantity +
          " × " +
          item.title,
        rows,
      );
  }
  element("h2", "Recorded budget", content);
  element(
    "p",
    snapshot.trip.budget === null
      ? "No total set."
      : "Total preference: " +
          snapshot.trip.currency +
          " " +
          snapshot.trip.budget,
    content,
  );
  const money = element("ul", undefined, content);
  for (const item of snapshot.budget_allocations || [])
    element(
      "li",
      "Planned: " + item.currency + " " + item.planned + " · " + item.category,
      money,
    );
  for (const item of snapshot.expenses || [])
    element(
      "li",
      "Recorded expense: " +
        item.currency +
        " " +
        item.amount +
        " · " +
        item.category +
        " · " +
        item.day,
      money,
    );
  element("h2", "Private documents included", content);
  for (const file of snapshot.documents || []) {
    if (
      !["application/pdf", "image/jpeg", "image/png"].includes(
        file.content_type,
      )
    )
      continue;
    const url = URL.createObjectURL(
      decodeDocument(file.data, file.content_type),
    );
    objectUrls.push(url);
    const link = element("a", "Download " + file.filename, content);
    link.className = "button";
    link.href = url;
    link.download = file.filename;
  }
  if (!snapshot.documents?.length)
    element("p", "No private documents were selected for this copy.", content);
}
async function load() {
  lock();
  downloads.replaceChildren();
  try {
    const copies = await listSnapshots();
    if (!copies.length)
      element(
        "p",
        "No offline trips yet. While online, open a trip → Offline and choose Download.",
        downloads,
      );
    copies.forEach((copy, index) => {
      const card = element("article", undefined, downloads);
      element("h2", "Saved trip " + (index + 1), card);
      const form = element("form", undefined, card),
        label = element("label", "Download passphrase", form),
        input = element("input", undefined, label);
      input.type = "password";
      input.required = true;
      input.minLength = 10;
      input.maxLength = 1000;
      input.autocomplete = "off";
      const unlock = element("button", "Unlock read-only copy", form);
      unlock.type = "submit";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        unlock.disabled = true;
        message.textContent = "";
        try {
          const snapshot = await decryptSnapshot(copy.envelope, input.value);
          input.value = "";
          render(snapshot);
        } catch {
          input.value = "";
          message.textContent =
            "Could not unlock this copy. Check your passphrase. If the download is damaged, remove it and download again while online.";
        } finally {
          unlock.disabled = false;
        }
      });
      button("Remove encrypted download", card, async () => {
        if (!confirm("Remove this encrypted copy from this browser?")) return;
        try {
          await removeSnapshot(copy.id);
          await load();
          message.textContent = "Encrypted download removed.";
        } catch {
          message.textContent = "Could not remove the download.";
        }
      }).className = "danger";
    });
  } catch {
    message.textContent = "Offline storage is unavailable in this browser.";
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) lock();
});
await load();
