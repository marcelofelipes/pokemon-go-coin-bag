import {
  UUIDS,
  applicationIdGattValue,
  generateApplicationId,
  decodeProtocolBleFinalize,
  decodeProtocolBleSend,
  decodePlayerName,
  encodeProtocolComplete,
  finalNonceGattValue,
  initialNonceGattValue,
  randomPeripheralNonce,
  validateFinalize,
  validateSend,
} from "./protocol.js";

import {
  initParticleCanvas,
  setScanningMode,
  burstJoyConParticles,
  burstGoldenCoins,
  animateStepTransition,
  playPokeballCaptureLock,
  initInteractiveTilt,
} from "./animations.js";

const CLIENT_VERSION = "2.0.0-vite";
const GATT_SETTLE_MS = 75;

const fxCanvas = document.querySelector("#fx-canvas");
const wizard = document.querySelector("#wizard");
const button = document.querySelector("#thing");
const stateText = document.querySelector("#thing-state");
const detailText = document.querySelector("#thing-detail");
const langButtons = document.querySelectorAll("[data-set-lang]");
const gotoStepBtns = document.querySelectorAll("[data-goto-step]");
const btnBleBack = document.querySelector("#btn-ble-back");
const btnUnpair = document.querySelector("#btn-unpair");
const coinTrophy = document.querySelector("#coin-trophy");

// BLE Step Header & Scanner elements
const bleStepEyebrow = document.querySelector("#ble-step-eyebrow");
const bleStepTitle = document.querySelector("#ble-step-title");
const scannerStatusLabel = document.querySelector("#scanner-status-label");
const virtualSwitchIdEl = document.querySelector("#virtual-switch-id");
const deviceSlot = document.querySelector("#device-slot");
const slotTitle = document.querySelector("#slot-title");
const slotSubtitle = document.querySelector("#slot-subtitle");
const slotBadge = document.querySelector("#slot-badge");
const subSteps = document.querySelectorAll(".substep");

// Step 5 Reward elements
const rewardTitle = document.querySelector("#reward-title");
const rewardDesc = document.querySelector("#reward-desc");

const BUSY_STATES = new Set([
  "requesting-device",
  "connecting",
  "reading-device",
  "pairing",
  "exchanging",
]);

const I18N = {
  pt: {
    step2Eyebrow: "PASSO 2 DE 4 · 1ª CONEXÃO BLUETOOTH",
    step2Title: "Parear Switch com o Pokémon GO",
    step4Eyebrow: "PASSO 4 DE 4 · 2ª CONEXÃO BLUETOOTH",
    step4Title: "Receber Cartão-Postal & Liberar Coin Bag",
    unsupported: "Abra no Chrome ou Edge",
    unsupportedDetail: "Este navegador não possui suporte a Bluetooth Web.",
    readyStep2: "Parear Switch Agora",
    readyStep4: "Receber Cartão-Postal",
    readyHint: "Toque na Poké Bola para sincronizar",
    "requesting-device": "Buscando Pokémon GO…",
    connecting: "Conectando ao jogo…",
    "reading-device": "Identificando treinador…",
    pairing: "Pareando Switch…",
    exchanging: "Recebendo Cartão-Postal…",
    "success-pair": "Switch Pareado! Avançando…",
    "success-exchange": "Coin Bag Liberada!",
    failure: "Toque para tentar novamente",
    friendlyRetry: "Deixe o Pokémon GO buscando o Switch e toque na Poké Bola.",
    scannerReady: "SWITCH VIRTUAL PRONTO",
    scannerBusy: "SINCRONIZANDO EM SEQUÊNCIA…",
    scannerDone: "ETAPA CONCLUÍDA!",
    slotDefaultSub: "Toque na Poké Bola abaixo para iniciar",
    slotSearchingSub: "Procurando sinal Bluetooth do Pokémon GO…",
    slotFoundSub: (mode) =>
      mode === 0x00 ? "Modo Pareamento confirmado" : "Envio de Postal confirmado",
    rewardExchangeTitle: "Sacola de Moedas Liberada!",
    rewardExchangeDesc: (name) =>
      `Cartão-postal de ${name} recebido! Abra sua Bolsa no Pokémon GO para usar a Coin Bag e capturar o Gimmighoul.`,
    unpairDone: "Switch Despareado! Voltando ao início…",
  },
  en: {
    step2Eyebrow: "STEP 2 OF 4 · 1ST BLUETOOTH CONNECTION",
    step2Title: "Pair Switch with Pokémon GO",
    step4Eyebrow: "STEP 4 OF 4 · 2ND BLUETOOTH CONNECTION",
    step4Title: "Receive Postcard & Unlock Coin Bag",
    unsupported: "Open in Chrome or Edge",
    unsupportedDetail: "This browser does not support Web Bluetooth.",
    readyStep2: "Pair Switch Now",
    readyStep4: "Receive Postcard",
    readyHint: "Tap the Poké Ball to sync",
    "requesting-device": "Searching Pokémon GO…",
    connecting: "Connecting to game…",
    "reading-device": "Reading trainer info…",
    pairing: "Pairing Switch…",
    exchanging: "Receiving Postcard…",
    "success-pair": "Switch Paired! Advancing…",
    "success-exchange": "Coin Bag Unlocked!",
    failure: "Tap to try again",
    friendlyRetry: "Keep Pokémon GO searching for Switch and tap the Poké Ball.",
    scannerReady: "VIRTUAL SWITCH READY",
    scannerBusy: "SYNCING IN SEQUENCE…",
    scannerDone: "STEP COMPLETED!",
    slotDefaultSub: "Tap the Poké Ball below to start",
    slotSearchingSub: "Looking for Pokémon GO Bluetooth signal…",
    slotFoundSub: (mode) =>
      mode === 0x00 ? "Switch Pairing mode confirmed" : "Postcard Transfer confirmed",
    rewardExchangeTitle: "Coin Bag Unlocked!",
    rewardExchangeDesc: (name) =>
      `Postcard from ${name} received! Check your Items in Pokémon GO to open your Coin Bag and catch Gimmighoul.`,
    unpairDone: "Switch Unpaired! Returning to start…",
  },
};

let currentLang = localStorage.getItem("coinbag_lang") || "pt";
let currentStep = 1; // 1 -> 2 -> 3 -> 4 -> 5
let currentState = "ready";
let lastPlayerName = "";
let lastMode = null;
let rememberedDevice = null;
let activeDevice = null;
let busy = false;

function dict() {
  return I18N[currentLang] ?? I18N.pt;
}

function getActiveSlideEl(step) {
  if (step === 2 || step === 4) {
    return document.querySelector('.step-view[data-view="ble"]');
  }
  return document.querySelector(`.step-view[data-view="${step}"]`);
}

function setStep(step) {
  const prevStep = currentStep;
  const direction = step >= prevStep ? 1 : -1;
  currentStep = step;
  wizard.dataset.step = String(step);

  // Update sequential progress nodes (1..5)
  document.querySelectorAll(".step-node").forEach((node) => {
    const s = Number(node.dataset.gotoStep);
    node.classList.toggle("active", s === step);
    node.classList.toggle("completed", s < step);
  });

  // Update connecting lines (1..4)
  document.querySelectorAll(".track-fill").forEach((line) => {
    const l = Number(line.dataset.line);
    line.classList.toggle("filled", l < step);
  });

  if (step === 2 || step === 4) {
    currentState = navigator.bluetooth ? "ready" : "unsupported";
  }

  renderState();

  const activeSlide = getActiveSlideEl(step);
  animateStepTransition(activeSlide, direction);

  if (step === 5) {
    setTimeout(() => burstGoldenCoins(coinTrophy || wizard), 120);
  }
}

function applyLanguage(lang) {
  currentLang = lang === "en" ? "en" : "pt";
  document.documentElement.dataset.lang = currentLang;
  document.documentElement.lang = currentLang === "pt" ? "pt-BR" : "en";
  localStorage.setItem("coinbag_lang", currentLang);

  for (const btn of langButtons) {
    btn.classList.toggle("active", btn.dataset.setLang === currentLang);
  }
  renderState();
}

function updateSubSteps() {
  let activeSub = 1;
  let allDone = false;

  if (currentState === "requesting-device" || currentState === "connecting") {
    activeSub = 1;
  } else if (currentState === "reading-device") {
    activeSub = 2;
  } else if (currentState === "pairing" || currentState === "exchanging") {
    activeSub = 3;
  } else if (currentState === "success-pair" || currentState === "success-exchange") {
    allDone = true;
  }

  subSteps.forEach((el) => {
    const num = Number(el.dataset.sub);
    el.classList.toggle("done", allDone || (BUSY_STATES.has(currentState) && num < activeSub));
    el.classList.toggle("active", !allDone && BUSY_STATES.has(currentState) && num === activeSub);
  });
}

function updateScannerCard() {
  const d = dict();
  const savedAppId = localStorage.getItem("applicationId");
  if (savedAppId) {
    virtualSwitchIdEl.textContent = `Switch ID: ${savedAppId.slice(0, 8).toUpperCase()}`;
  } else {
    virtualSwitchIdEl.textContent = "Switch-Titan";
  }

  if (currentStep === 2) {
    bleStepEyebrow.textContent = d.step2Eyebrow;
    bleStepTitle.textContent = d.step2Title;
  } else if (currentStep === 4) {
    bleStepEyebrow.textContent = d.step4Eyebrow;
    bleStepTitle.textContent = d.step4Title;
  }

  if (BUSY_STATES.has(currentState)) {
    scannerStatusLabel.textContent = d.scannerBusy;
    deviceSlot.classList.add("active-link");
    deviceSlot.classList.remove("connected-link");
    if (lastPlayerName) {
      slotTitle.textContent = lastPlayerName;
      slotSubtitle.textContent = d.slotFoundSub(lastMode);
      slotBadge.textContent = lastMode === 0x00 ? "STEP 2" : "STEP 4";
    } else {
      slotTitle.textContent = "Pokémon GO";
      slotSubtitle.textContent = d.slotSearchingSub;
      slotBadge.textContent = "SCAN";
    }
  } else if (currentState === "success-pair" || currentState === "success-exchange") {
    scannerStatusLabel.textContent = d.scannerDone;
    deviceSlot.classList.remove("active-link");
    deviceSlot.classList.add("connected-link");
    slotTitle.textContent = lastPlayerName || "Pokémon GO";
    slotSubtitle.textContent = d.scannerDone;
    slotBadge.textContent = "OK";
  } else {
    scannerStatusLabel.textContent = d.scannerReady;
    deviceSlot.classList.remove("active-link", "connected-link");
    slotTitle.textContent = lastPlayerName ? `Pokémon GO (${lastPlayerName})` : "Pokémon GO";
    slotSubtitle.textContent = d.slotDefaultSub;
    slotBadge.textContent = currentStep === 4 ? "POSTCARD" : "PAIR";
  }

  updateSubSteps();
}

function renderState() {
  const d = dict();
  const isBusy = BUSY_STATES.has(currentState);
  setScanningMode(isBusy);

  if (currentState === "ready") {
    stateText.textContent = currentStep === 4 ? d.readyStep4 : d.readyStep2;
    detailText.textContent = d.readyHint;
  } else if (currentState === "unsupported") {
    stateText.textContent = d.unsupported;
    detailText.textContent = d.unsupportedDetail;
  } else if (currentState === "failure") {
    stateText.textContent = d.failure;
    detailText.textContent = d.friendlyRetry;
  } else {
    stateText.textContent = d[currentState] ?? currentState;
    detailText.textContent = lastPlayerName ? `Trainer: ${lastPlayerName}` : "";
  }

  button.dataset.state = currentState;
  button.disabled = currentState === "unsupported" || isBusy;

  rewardTitle.textContent = d.rewardExchangeTitle;
  rewardDesc.textContent = d.rewardExchangeDesc(lastPlayerName || "Pokémon GO");

  updateScannerCard();
}

function setState(state) {
  currentState = state;
  renderState();
}

// Event Listeners
langButtons.forEach((btn) => {
  btn.addEventListener("click", () => applyLanguage(btn.dataset.setLang));
});

gotoStepBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (busy) return;
    const target = Number(btn.dataset.gotoStep);
    setStep(target);
  });
});

btnBleBack.addEventListener("click", () => {
  if (busy) return;
  setStep(currentStep === 4 ? 3 : 1);
});

if (coinTrophy) {
  coinTrophy.addEventListener("click", () => burstGoldenCoins(coinTrophy));
}

async function unpairSwitch() {
  if (busy) return;
  busy = true;

  try {
    if (activeDevice?.gatt?.connected) {
      activeDevice.gatt.disconnect();
    }
    if (rememberedDevice?.gatt?.connected) {
      rememberedDevice.gatt.disconnect();
    }
    if (typeof rememberedDevice?.forget === "function") {
      try {
        await rememberedDevice.forget();
      } catch {
        // Ignore if forget() is unsupported or fails
      }
    }
    if (typeof navigator.bluetooth?.getDevices === "function") {
      try {
        const permitted = await navigator.bluetooth.getDevices();
        for (const dev of permitted) {
          if (dev.gatt?.connected) dev.gatt.disconnect();
          if (typeof dev.forget === "function") {
            try {
              await dev.forget();
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    localStorage.removeItem("applicationId");
    rememberedDevice = null;
    activeDevice = null;
    lastPlayerName = "";
    lastMode = null;

    if (btnUnpair) {
      const labelEl = btnUnpair.querySelector("#unpair-btn-label");
      const originalHtml = labelEl ? labelEl.innerHTML : "";
      btnUnpair.classList.add("unpaired-done");
      btnUnpair.disabled = true;
      if (labelEl) {
        labelEl.textContent = dict().unpairDone;
      }
      burstJoyConParticles(btnUnpair);
      await sleep(900);
      if (labelEl) {
        labelEl.innerHTML = originalHtml;
      }
      btnUnpair.classList.remove("unpaired-done");
      btnUnpair.disabled = false;
    }

    setStep(1);
  } finally {
    busy = false;
  }
}

if (btnUnpair) {
  btnUnpair.addEventListener("click", unpairSwitch);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toBytes(dataView) {
  return new Uint8Array(
    dataView.buffer.slice(dataView.byteOffset, dataView.byteOffset + dataView.byteLength)
  );
}

function isUserCancelledError(error) {
  const cause = error?.cause ?? error;
  const name = cause?.name ?? "";
  const msg = (cause?.message ?? String(cause ?? "")).toLowerCase();
  return (
    name === "NotFoundError" ||
    name === "AbortError" ||
    msg.includes("cancelled") ||
    msg.includes("canceled") ||
    msg.includes("user gesture")
  );
}

async function gattOperation(label, operation, { settleMs = GATT_SETTLE_MS } = {}) {
  console.log(`→ ${label}`);
  try {
    const result = await operation();
    console.log(`✓ ${label}`);
    if (settleMs > 0) await sleep(settleMs);
    return result;
  } catch (error) {
    console.warn(`✗ ${label}`, error);
    const wrapped = new Error(label);
    wrapped.cause = error;
    throw wrapped;
  }
}

async function writeWithResponse(characteristic, value, label) {
  await gattOperation(`${label} (${value.byteLength} bytes, with response)`, async () => {
    if (typeof characteristic.writeValueWithResponse === "function") {
      await characteristic.writeValueWithResponse(value);
      return;
    }
    if (typeof characteristic.writeValue === "function") {
      await characteristic.writeValue(value);
      return;
    }
    throw new Error("GATT write unsupported");
  });
}

function isAmbiguousRegistrationWriteError(error) {
  const cause = error?.cause ?? error;
  const name = cause?.name ?? "";
  const message = cause?.message ?? String(cause ?? "");
  const normalized = `${name}: ${message}`.toLowerCase();

  return (
    ["NotSupportedError", "NetworkError", "OperationError"].includes(name) &&
    (normalized.includes("gatt error unknown") ||
      normalized.includes("gatt operation failed for unknown reason"))
  );
}

async function writeRegistrationApplicationId(characteristic, value) {
  try {
    await writeWithResponse(characteristic, value, "Write application ID");
  } catch (error) {
    if (!isAmbiguousRegistrationWriteError(error)) throw error;
    console.info("Registration write completed with ambiguous ATT ack; treating as paired.");
    await sleep(600);
  }
}

function characteristicValueWaiter(characteristic, timeoutMs, label) {
  let settled = false;
  let rejectPromise;
  let resolvePromise;
  let timer;

  function cleanup() {
    clearTimeout(timer);
    characteristic.removeEventListener("characteristicvaluechanged", onValue);
  }

  function onValue(event) {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise(toBytes(event.target.value));
  }

  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timeout waiting for ${label}`));
    }, timeoutMs);
    characteristic.addEventListener("characteristicvaluechanged", onValue);
  });

  return {
    promise,
    cancel(reason = "Cancelled") {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(new Error(reason));
      promise.catch(() => {});
    },
  };
}

async function getCharacteristics(service) {
  const discovered = await gattOperation(
    "Discover Peripheral GATT characteristics",
    () => service.getCharacteristics(),
    { settleMs: 125 }
  );
  const byUuid = new Map(discovered.map((characteristic) => [characteristic.uuid, characteristic]));
  const requested = {
    protocol: UUIDS.readProtocol,
    name: UUIDS.readName,
    mode: UUIDS.readMode,
    applicationId: UUIDS.writeApplicationId,
    initialNonce: UUIDS.writeInitialNonce,
    complete: UUIDS.writeComplete,
    finalNonce: UUIDS.writeFinalNonce,
    data: UUIDS.indicateData,
    stage: UUIDS.indicateStage,
  };

  const result = {};
  for (const [name, uuid] of Object.entries(requested)) {
    const characteristic = byUuid.get(uuid);
    if (!characteristic) {
      throw new Error(`Missing characteristic ${name}`);
    }
    result[name] = characteristic;
  }
  return result;
}

async function performExchange(chars, applicationId, nonce, timeoutMs) {
  const noSettle = { settleMs: 0 };

  await gattOperation("Write application ID", async () => {
    if (typeof chars.applicationId.writeValueWithResponse === "function") {
      await chars.applicationId.writeValueWithResponse(applicationIdGattValue(applicationId));
    } else {
      await chars.applicationId.writeValue(applicationIdGattValue(applicationId));
    }
  }, noSettle);

  await gattOperation("Write initial nonce", async () => {
    await chars.initialNonce.writeValueWithoutResponse(initialNonceGattValue(nonce));
  }, noSettle);

  const firstWaiter = characteristicValueWaiter(chars.data, timeoutMs, "first DATA indication");
  try {
    await gattOperation("Enable DATA indications", () => chars.data.startNotifications(), noSettle);
  } catch (error) {
    firstWaiter.cancel("DATA subscription failed");
    throw error;
  }

  const firstRaw = await firstWaiter.promise;
  if (firstRaw.length < 303) {
    throw new Error("Negotiated ATT MTU insufficient");
  }

  const send = decodeProtocolBleSend(firstRaw);
  validateSend(send, applicationId, nonce);

  const complete = await encodeProtocolComplete(
    send.serverResponse.transactionId,
    send.serverResponse.nonce
  );
  const finalWaiter = characteristicValueWaiter(chars.data, timeoutMs, "finalize DATA");
  const finalWaiterStage = characteristicValueWaiter(chars.stage, timeoutMs, "finalize STAGE");
  const finalRacePromise = Promise.race([finalWaiter.promise, finalWaiterStage.promise]);

  try {
    await gattOperation("Enable STAGE indications", () => chars.stage.startNotifications(), noSettle);
  } catch (error) {
    finalWaiter.cancel();
    finalWaiterStage.cancel();
    throw error;
  }

  await gattOperation("Write RSA completion", async () => {
    await chars.complete.writeValueWithoutResponse(complete);
  }, noSettle);

  let finalRaw;
  try {
    finalRaw = await finalRacePromise;
  } catch {
    return;
  } finally {
    finalWaiter.cancel();
    finalWaiterStage.cancel();
  }

  await gattOperation("Write final nonce", async () => {
    if (typeof chars.finalNonce.writeValueWithResponse === "function") {
      await chars.finalNonce.writeValueWithResponse(finalNonceGattValue(nonce));
    } else {
      await chars.finalNonce.writeValue(finalNonceGattValue(nonce));
    }
  }, noSettle);

  const finalize = decodeProtocolBleFinalize(finalRaw);
  validateFinalize(finalize, applicationId, nonce);
}

async function acquirePokemonGoDevice() {
  if (rememberedDevice?.gatt) {
    try {
      await rememberedDevice.gatt.connect();
      return rememberedDevice;
    } catch {
      // Needs fresh scan
    }
  }

  if (typeof navigator.bluetooth.getDevices === "function") {
    try {
      const permitted = await navigator.bluetooth.getDevices();
      for (const dev of permitted) {
        try {
          await dev.gatt.connect();
          rememberedDevice = dev;
          return dev;
        } catch {
          // Next device
        }
      }
    } catch {
      // Fall back to requestDevice
    }
  }

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [UUIDS.advertisementService] }],
    optionalServices: [UUIDS.gattService],
  });
  rememberedDevice = device;
  return device;
}

async function doTheThing() {
  if (busy) return;
  busy = true;
  lastMode = null;

  try {
    if (!navigator.bluetooth || !crypto.randomUUID || !crypto.subtle) {
      setState("unsupported");
      return;
    }

    const nonce = randomPeripheralNonce();

    setState("requesting-device");
    activeDevice = await acquirePokemonGoDevice();

    setState("connecting");
    const server = activeDevice.gatt.connected
      ? activeDevice.gatt
      : await gattOperation(
          "Connect GATT",
          () => activeDevice.gatt.connect(),
          { settleMs: 150 }
        );

    const service = await gattOperation(
      "Discover service",
      () => server.getPrimaryService(UUIDS.gattService),
      { settleMs: 125 }
    );
    const chars = await getCharacteristics(service);

    setState("reading-device");
    const protocolValue = await gattOperation("Read protocol", () => chars.protocol.readValue());
    const nameValue = await gattOperation("Read player name", () => chars.name.readValue());
    const modeValue = await gattOperation("Read mode", () => chars.mode.readValue());

    const protocol = toBytes(protocolValue);
    const playerName = decodePlayerName(toBytes(nameValue));
    const mode = toBytes(modeValue);

    if (protocol.length !== 1 || protocol[0] !== 0x01 || mode.length !== 1) {
      throw new Error("Unexpected protocol/mode");
    }

    lastPlayerName = playerName;
    lastMode = mode[0];

    let applicationId = localStorage.getItem("applicationId");
    if (!applicationId) {
      applicationId = await generateApplicationId();
      localStorage.setItem("applicationId", applicationId);
    }

    if (mode[0] === 0x00) {
      setState("pairing");
      await sleep(250);
      await writeRegistrationApplicationId(
        chars.applicationId,
        applicationIdGattValue(applicationId)
      );
      setState("success-pair");
      playPokeballCaptureLock(button);
      burstJoyConParticles(button);
      await sleep(950);
      setStep(3);
    } else if (mode[0] === 0x01) {
      setState("exchanging");
      await performExchange(chars, applicationId, nonce, 15_000);
      setState("success-exchange");
      playPokeballCaptureLock(button);
      burstGoldenCoins(button);
      await sleep(850);
      setStep(5);
    } else {
      throw new Error("Unsupported mode");
    }
  } catch (error) {
    if (isUserCancelledError(error)) {
      setState("ready");
      return;
    }
    console.warn("Connection attempt did not complete:", error);
    setState("failure");
    setTimeout(() => {
      if (!busy && currentState === "failure") {
        setState("ready");
      }
    }, 3000);
  } finally {
    if (activeDevice?.gatt?.connected) {
      activeDevice.gatt.disconnect();
    }
    activeDevice = null;
    busy = false;
  }
}

button.addEventListener("click", doTheThing);

if (!navigator.bluetooth) {
  currentState = "unsupported";
} else {
  currentState = "ready";
}

initParticleCanvas(fxCanvas);
initInteractiveTilt(wizard);
applyLanguage(currentLang);
setStep(1);
