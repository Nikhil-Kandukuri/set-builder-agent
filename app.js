const setItems = new Set();

const singleForm = document.getElementById("single-input");
const singleInput = document.getElementById("single-value");
const bulkForm = document.getElementById("bulk-input");
const bulkInput = document.getElementById("bulk-values");
const chipList = document.getElementById("set-items");
const emptyState = document.getElementById("empty-state");
const output = document.getElementById("set-output");
const clearButton = document.getElementById("clear-set");
const copyButton = document.getElementById("copy-set");
const chipTemplate = document.getElementById("chip-template");

function sanitizeValue(value) {
  return value.trim().replace(/\s+/g, " ");
}

function addValue(value) {
  const sanitized = sanitizeValue(value);
  if (!sanitized) {
    return false;
  }

  const sizeBefore = setItems.size;
  setItems.add(sanitized);
  const added = setItems.size !== sizeBefore;
  if (added) {
    render();
  }
  return added;
}

function addMany(raw) {
  const parts = raw
    .split(/[\n,]/)
    .map((value) => sanitizeValue(value))
    .filter(Boolean);

  let addedAny = false;
  for (const part of parts) {
    const result = addValue(part);
    if (result) {
      addedAny = true;
    }
  }

  if (!addedAny) {
    announce("No new values were added.");
  }
}

function removeValue(value) {
  if (setItems.delete(value)) {
    render();
    announce(`${value} removed from the set.`);
  }
}

function clearSet() {
  if (setItems.size === 0) {
    announce("Set is already empty.");
    return;
  }
  setItems.clear();
  render();
  announce("All values cleared.");
}

function render() {
  chipList.innerHTML = "";
  if (setItems.size === 0) {
    emptyState.hidden = false;
    output.textContent = "";
    return;
  }

  emptyState.hidden = true;
  const fragment = document.createDocumentFragment();
  for (const value of Array.from(setItems).sort(Intl.Collator().compare)) {
    const chip = chipTemplate.content.firstElementChild.cloneNode(true);
    chip.querySelector(".chip-label").textContent = value;
    chip
      .querySelector(".chip-remove")
      .addEventListener("click", () => removeValue(value));
    fragment.appendChild(chip);
  }
  chipList.appendChild(fragment);

  const literal = `{ ${Array.from(setItems)
    .map((value) => `"${value}"`)
    .join(", ")} }`;
  output.textContent = literal;
}

function announce(message) {
  if (!message) return;
  const politeRegion = document.createElement("div");
  politeRegion.setAttribute("aria-live", "polite");
  politeRegion.className = "sr-only";
  politeRegion.textContent = message;
  document.body.appendChild(politeRegion);
  setTimeout(() => politeRegion.remove(), 1000);
}

singleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = singleInput.value;
  const added = addValue(value);
  if (!added) {
    announce("Value is empty or already exists.");
  } else {
    announce(`${sanitizeValue(value)} added to the set.`);
  }
  singleInput.value = "";
  singleInput.focus();
});

bulkForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addMany(bulkInput.value);
  bulkInput.value = "";
  bulkInput.focus();
});

clearButton.addEventListener("click", clearSet);

copyButton.addEventListener("click", async () => {
  if (setItems.size === 0) {
    announce("Nothing to copy. The set is empty.");
    return;
  }

  try {
    await navigator.clipboard.writeText(output.textContent);
    announce("Set literal copied to clipboard.");
  } catch (error) {
    console.error(error);
    announce("Copy failed. Your browser may block clipboard access.");
  }
});

render();
