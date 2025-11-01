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
const aiForm = document.getElementById("ai-input");
const aiPrompt = document.getElementById("ai-prompt");
const aiStatus = document.getElementById("ai-status");
const aiCancelButton = document.getElementById("ai-cancel");
const aiSubmitButton = aiForm?.querySelector('button[type="submit"]') ?? null;
let aiRequestController = null;

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

function addItemsFromArray(items) {
  if (!Array.isArray(items)) {
    return false;
  }

  let addedAny = false;
  for (const item of items) {
    if (typeof item !== "string") {
      continue;
    }
    const added = addValue(item);
    if (added) {
      addedAny = true;
    }
  }
  return addedAny;
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

function setAiLoading(isLoading) {
  if (!aiForm) return;
  if (aiSubmitButton) {
    aiSubmitButton.disabled = isLoading;
  }
  if (aiPrompt) {
    aiPrompt.disabled = isLoading;
  }
  if (aiCancelButton) {
    aiCancelButton.hidden = !isLoading;
    aiCancelButton.disabled = !isLoading;
  }
}

function updateAiStatus(message, state = "info") {
  if (!aiStatus) return;

  if (!message) {
    aiStatus.textContent = "";
    aiStatus.hidden = true;
    aiStatus.removeAttribute("data-state");
    return;
  }

  aiStatus.hidden = false;
  aiStatus.dataset.state = state;
  aiStatus.textContent = message;
}

aiCancelButton?.addEventListener("click", () => {
  if (aiRequestController) {
    aiRequestController.abort();
  }
});

aiForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = sanitizeValue(aiPrompt?.value ?? "");
  if (!prompt) {
    announce("Describe what you need before asking the assistant.");
    aiPrompt?.focus();
    return;
  }

  if (aiRequestController) {
    aiRequestController.abort();
  }

  aiRequestController = new AbortController();
  setAiLoading(true);
  updateAiStatus("Contacting the assistant…");

  try {
    const response = await fetch("/api/build-set", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
      signal: aiRequestController.signal,
    });

    if (!response.ok) {
      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error) {
          errorMessage = errorBody.error;
        }
      } catch (parseError) {
        // Ignore JSON parse errors and keep the default message.
      }
      throw new Error(errorMessage);
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.items)
      ? payload.items
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    if (items.length === 0) {
      updateAiStatus(
        "The assistant didn't return any items. Try rephrasing your request.",
        "error"
      );
      announce("Assistant did not return any items.");
      return;
    }

    const uniqueItems = Array.from(new Set(items));
    const addedAny = addItemsFromArray(uniqueItems);

    if (addedAny) {
      updateAiStatus(
        `Added ${uniqueItems.length} item${uniqueItems.length > 1 ? "s" : ""} from the assistant.`,
        "success"
      );
      announce(
        `Assistant added ${uniqueItems.length} item${uniqueItems.length > 1 ? "s" : ""} to the set.`
      );
    } else {
      updateAiStatus(
        "All assistant suggestions were already part of your set.",
        "info"
      );
      announce("Assistant returned only existing values.");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      updateAiStatus("Assistant request cancelled.", "info");
      announce("Assistant request cancelled.");
    } else {
      console.error(error);
      let message = error.message || "Unable to reach the assistant.";
      if (error instanceof TypeError && /Failed to fetch/i.test(error.message)) {
        message =
          "Could not reach the backend. Make sure the server is running and try again.";
      }
      updateAiStatus(message, "error");
      announce("Assistant request failed.");
    }
  } finally {
    setAiLoading(false);
    aiRequestController = null;
  }
});

render();
