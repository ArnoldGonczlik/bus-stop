import itemDefs from './items.json';

const SLOT_COUNT = 3;

// slots[i] = { itemId: string, count: number } | null
const slots = [null, null, null];
let selectedSlot = 0;
let invLang = 'no';

// DOM refs
let hudEl = null;
let slotEls = [];
let toastEl = null;

/** Set current UI language ('no' | 'en') for toast messages */
export function setInventoryLang(lang) {
  invLang = lang;
}

/** Show or hide the inventory HUD (hide on pause/overlay) */
export function setInventoryVisible(visible) {
  if (hudEl) hudEl.classList.toggle('inv-hidden', !visible);
}

/** Looks up an item definition by id */
export function getItemDef(id) {
  return itemDefs.items.find(i => i.id === id) ?? null;
}

/** Call once on page load to build the HUD and register keyboard listeners */
export function initInventory() {
  // HUD container
  hudEl = document.createElement('div');
  hudEl.id = 'inventory-hud';
  document.body.appendChild(hudEl);

  for (let i = 0; i < SLOT_COUNT; i++) {
    const slot = document.createElement('div');
    slot.className = 'inv-slot' + (i === 0 ? ' selected' : '');
    slot.innerHTML = `
      <span class="inv-slot-key">${i + 1}</span>
      <span class="inv-slot-icon"></span>
      <span class="inv-slot-count"></span>
    `;
    hudEl.appendChild(slot);
    slotEls.push(slot);
  }

  // Toast notification
  toastEl = document.createElement('div');
  toastEl.id = 'inv-toast';
  document.body.appendChild(toastEl);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Digit1') setSelectedSlot(0);
    else if (e.code === 'Digit2') setSelectedSlot(1);
    else if (e.code === 'Digit3') setSelectedSlot(2);
  });

  renderHUD();
}

function setSelectedSlot(index) {
  selectedSlot = index;
  slotEls.forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });
}

export function getSelectedSlot() {
  return selectedSlot;
}

/** Total count of a specific item across all slots. */
export function getItemCount(itemId) {
  return slots.reduce((sum, s) => (s && s.itemId === itemId ? sum + s.count : sum), 0);
}

/** Clear all slots and re-render (call on game reset). */
export function resetInventory() {
  for (let i = 0; i < SLOT_COUNT; i++) slots[i] = null;
  if (slotEls.length) renderHUD();
}

/**
 * Add an item to the inventory.
 * Stacks if stackable and already present, otherwise fills first empty slot.
 * Returns true if added successfully, false if inventory is full.
 */
export function addToInventory(itemId) {
  const def = getItemDef(itemId);
  if (!def) return false;

  if (def.stackable) {
    // Find existing slot with same item
    const existing = slots.findIndex(s => s && s.itemId === itemId && s.count < def.maxStack);
    if (existing !== -1) {
      slots[existing].count += 1;
      renderHUD();
      showToast(def, 1);
      return true;
    }
  }

  // Find first empty slot
  const emptyIdx = slots.findIndex(s => s === null);
  if (emptyIdx === -1) return false; // full

  slots[emptyIdx] = { itemId, count: 1 };
  renderHUD();
  showToast(def, 1);
  return true;
}

function renderHUD() {
  slotEls.forEach((el, i) => {
    const iconEl  = el.querySelector('.inv-slot-icon');
    const countEl = el.querySelector('.inv-slot-count');
    const s = slots[i];
    if (s) {
      const def = getItemDef(s.itemId);
      iconEl.textContent  = def ? def.icon : '?';
      countEl.textContent = s.count > 1 ? s.count : '';
      el.classList.add('has-item');
    } else {
      iconEl.textContent  = '';
      countEl.textContent = '';
      el.classList.remove('has-item');
    }
  });
}

let _toastTimeout = null;
function showToast(def, count) {
  if (!toastEl) return;
  const name = (invLang === 'no' && def.name_no) ? def.name_no : def.name;
  toastEl.textContent = `+${count} ${name}`;
  toastEl.classList.add('visible');
  if (_toastTimeout) clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 1600);
}

