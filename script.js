const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const stopBtn = document.getElementById('stop-btn');
const controlsWrapper = document.querySelector('.controls-wrapper');
const msg = document.getElementById('msg');
const videoPlayback = document.getElementById('video-playback');
const historyContainer = document.getElementById('recordings');
const cancelRecordingCardSelection = document.getElementById('cancel-recording-selection');
const modal = document.querySelector('#playback-modal');
const multiDeleteBtn = document.querySelector('#delete-multiple-button');

const HISOTY_KEY = `RECORDINGS`;
const DEF_OF_NEW_RECORDING = 5 * 60 * 1000; // Not recorded more than 5 mins ago 

let mediaRecorder, stream;
let recordedChunks = [];

const db = new Dexie(HISOTY_KEY);
db.version(1).stores({
  recordings: `++id, title, blob, at`,
});

const dateFormatter = new Intl.DateTimeFormat(navigator.language, {
  dateStyle: "medium",
  timeStyle: "short"
});

function showToast(m, d = 5) {
  Toastify({
    text: m,
    duration: d * 1000,
  }).showToast();
}

async function estimateStorage() {
  let details = "Storage Estimation API Not Supported";

  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const { usage, quota } = await navigator.storage.estimate();
    const percentUsed = (usage / quota * 100).toFixed(2);
    const usageInMb = ((usage / (1024 * 1024))).toFixed(2);
    const quotaInMb = ((quota / (1024 * 1024))).toFixed(2);

    details = `${usageInMb} out of ${quotaInMb} MB used (${percentUsed}%)`;

    return details
  }
}

function updateControls(start_shown = 1, pause_shown = 0, resume_shown = 0, stop_shown = 0) {
  startBtn.style.display = (start_shown) ? "block" : "none";
  pauseBtn.style.display = (pause_shown) ? "block" : "none";
  resumeBtn.style.display = (resume_shown) ? "block" : "none";
  stopBtn.style.display = (stop_shown) ? "block" : "none";

  controlsWrapper.style.height = stop_shown?"100%": "auto";
}

async function delRecording(data) {
  videoPlayback.src = null;

  await db.recordings.delete(data.id);
}

async function renameRecording(data) {
  let ts = data.title.split(".");
  let t = data.title.replace("." + ts[ts.length - 1], "");
  let p = prompt("Enter new name", t);
  if (p.trim().length == 0) {
    showToast("Title can't be empty.");
    return null;
  } else {
    p = p.replaceAll(/\W/gi, "-").replaceAll(/-{2,}/gi, "-");
    p = p.substring(0, 128);
    p = p + "." + ts[ts.length - 1];
    return await db.recordings.update(data.id, { title: p });
  }
}

function createElement(nodeName, classes, textContent) {
  const el = document.createElement(nodeName);
  classes.forEach(c => {
    el.classList.add(c);
  });
  el.textContent = textContent;
  return el;
}

function saveRecording(mimeType) {
  const blob = new Blob(recordedChunks, { type: mimeType });
  recordedChunks = [];
  const videoURL = URL.createObjectURL(blob);

  videoPlayback.src = videoURL;

  let recordedAt = new Date();

  db.recordings.add({
    "blob": blob,
    "at": recordedAt,
    "title": `record.idkey.in-${dateFormatter.format(new Date()).replaceAll(/\W/gi, '-')}.webm`
  }).then(a => { renderHistory() });

  // Stop the media stream tracks
  stream.getTracks().forEach(track => track.stop());

  updateControls(1, 0, 0, 0);
}

function closeModal() {
  modal.classList.remove("is-active");
  videoPlayback.pause();
}

function cancelRecordingCardSelector() {
  document.querySelectorAll(".recording-card-selector").forEach(el => {
    el.checked = false;
  });
}

cancelRecordingCardSelection.addEventListener("click", cancelRecordingCardSelector);

document.addEventListener("keydown", e => {
  if (e.ctrlKey)
    console.log(e.keyCode, e.key);

  if (e.key === '?' && e.shiftKey && !e.target.matches('input, textarea')) {
    e.preventDefault(); // Prevent the '?' character from being typed
    showShortcutsModal();
  }


  if (mediaRecorder) {
    if (e.keyCode == 83 && mediaRecorder.state == "inactive") {
      startBtn.click();
    } else if (e.keyCode == 83 && mediaRecorder.state == "recording") {
      stopBtn.click();
    } else if (e.keyCode == 80 && mediaRecorder.state == "recording") {
      pauseBtn.click();
    } else if (e.keyCode == 82 && mediaRecorder.state == "paused") {
      resumeBtn.click();
    }
  } else if (e.keyCode == 83) {
    startBtn.click();
  } else if (e.ctrlKey && e.keyCode == 65) {
    document.querySelectorAll(".recording-card-selector").forEach(el => {
      el.checked = true;
    });
  } else if (e.keyCode == 8) {
    multiDeleteBtn.click();
  }

  if (e.keyCode == 27) {
    closeModal();
    cancelRecordingCardSelector();
    closeShortcutsModal();
  }
});

document.querySelectorAll('#playback-modal .modal-close, #playback-modal .modal-background').forEach(el => {
  el.addEventListener("click", closeModal);
});

multiDeleteBtn.addEventListener("click", async e => {
  let selectedContent = document.querySelectorAll("input[type=checkbox]:checked");
  let keys = Array.from(selectedContent).map(c => Number(c.value));
  if (keys.length && confirm(`Are your sure to delete ${keys.length} recordings?`)) {
    let deletedDetails = await db.recordings.bulkDelete(keys);
    renderHistory();
  }
});

startBtn.addEventListener('click', async () => {
  try {
    // Request access to the user's screen
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

    // Set up the MediaRecorder
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

    // Listen for data chunks and push them into the array
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    // When the recording stops, create a video Blob and a download link
    mediaRecorder.onstop = saveRecording;

    // Start the recording
    mediaRecorder.start();

    updateControls(0, 1, 0, 1);
    timer.start();
    timer.el.style.display = "block";
  } catch (err) {
    console.error("Error: " + err);
    showToast("Error: Could not start recording.");
    updateControls(1, 0, 0, 0);
  }
});

pauseBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state == 'recording') {
    mediaRecorder.pause();
    updateControls(0, 0, 1, 1);
    timer.stop();
  }
});

resumeBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state == 'paused') {
    mediaRecorder.resume();
    updateControls(0, 1, 0, 1);
    timer.start( false );
  }
});

stopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  timer.stop();
  timer.el.style.display = "none";
});

function renderHistory() {
  let current_date = null;
  historyContainer.querySelectorAll(".column").forEach(l => l.remove());

  db.recordings.orderBy("at").reverse().each(data => {
    if (current_date != data.at.toDateString()) {
      current_date = data.at.toDateString();
      let li = createElement("div", ["category", "column", "is-full"], `🗓️ ${current_date}`);
      historyContainer.appendChild(li);
    }

    let del = createElement("button", ["del", "card-footer-item"], "❌");
    del.addEventListener("click", async r => {
      r.preventDefault();
      if (confirm("Are you sure to delete this?")) {
        await delRecording(data);
        renderHistory();
      }
    });

    let preview = createElement("button", ["preview", "card-footer-item"], "👀");
    preview.addEventListener("click", async r => {
      r.preventDefault();
      videoPlayback.src = a.href;
      modal.classList.add("is-active");
    });

    let rename = createElement("button", ["rename", "card-footer-item"], "✏️");
    rename.addEventListener("click", async r => {
      r.preventDefault();
      let d = await renameRecording(data);
      if (d) renderHistory();
    });

    let dropdownContainer = createElement("div", ["card-footer"], null);

    let a = createElement("a", ["download", "card-footer-item"], `⬇️`);
    a.href = URL.createObjectURL(data.blob);
    a.download = data.title;

    dropdownContainer.appendChild(del);
    dropdownContainer.appendChild(rename);
    dropdownContainer.appendChild(preview);
    dropdownContainer.appendChild(a);

    let card = createElement("div", ["card", "recording"], null);
    let cardContainer = createElement("div", ["card-content"], null);
    cardContainer.appendChild(createElement("h3", ["rec-title", "subtitle", "block"], `${data.title}`));
    cardContainer.appendChild(createElement("span", ["size", "tag"], `${(data.blob.size / (1024 * 1024)).toFixed(2)}MB`));
    cardContainer.appendChild(createElement("span", ["time", "tag", "ml-2"], `${data.at.toLocaleTimeString(navigator.language)}`));

    card.appendChild(cardContainer);
    if( (Date.now() - data.at.getTime()) <= DEF_OF_NEW_RECORDING )
      card.appendChild( createElement("div", ["new-tag"], null) );
    card.appendChild(dropdownContainer);

    let checkbox = createElement("input", ["is-hidden", "recording-card-selector"], null);
    checkbox.setAttribute("type", "checkbox");
    checkbox.id = data.id;
    checkbox.value = data.id;
    let column = createElement("label", ["column", "is-full-mobile", "is-half-tablet", "is-one-third-desktop", "is-one-quarter-widescreen", "is-one-fifth-fullhd"], null);
    column.setAttribute("for", data.id);
    checkbox.setAttribute("type", "checkbox");
    checkbox.id = data.id;
    checkbox.value = data.id;
    column.appendChild(checkbox);
    column.appendChild(card);
    column.dataset.id = data.id;
    historyContainer.appendChild(column);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

renderHistory();

const timer = {
  el: document.querySelector(".controls-wrapper .timer"),
  t: null,
  s: 0,
  start: function( reset = true ) {
    if ( reset ) this.s = 0;
    clearInterval( this.t )
    this.t = setInterval( () => {
      this.el.textContent = (new Date(++this.s * 1000)).toJSON().substring(11, 19)
    }, 1000);
  },
  stop: function() {
    clearInterval( this.t );
  }
}

if (!navigator.mediaDevices.getDisplayMedia) {
  document.querySelector(".controls").style.display = "none";
  document.querySelector("#main-content").style.display = "none";
  msg.innerText = "Your browser does not support screen recording feature.";
} else {
  setInterval(() => {
    msg.style.display = "block";
    estimateStorage().then(m => {
      msg.textContent = m;
    });
  }, 4 * 1000);
}

/**
 * Global function to close the shortcuts modal.
 */
function closeShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  if (modal) {
    modal.classList.remove('is-active');
    // For a cleaner DOM, we can remove the element after a short delay
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 150);
  }
}

/**
 * Creates and displays the keyboard shortcuts modal popup using Bulma CSS.
 */
function showShortcutsModal() {
  // Prevent multiple modals from opening
  if (document.getElementById('shortcuts-modal')) return;

  // 1. Define the list of shortcuts
  const shortcuts = [
    { keys: 'Shift + ?', description: 'Show all keyboard shortcuts (this popup)' },
    { keys: 'S', description: 'Start/Stop recording' },
    { keys: 'P', description: 'Pause recording' },
    { keys: 'R', description: 'Resume recording' },
    { keys: 'Ctrl + A', description: 'Select all recording cards' },
    { keys: 'Backspace', description: 'Delete selected recording cards' },
    { keys: 'Esc', description: 'Close any active modal / Cancel card selection' }
  ];

  // 2. Create the Modal structure (Bulma: .modal)
  const modal = document.createElement('div');
  modal.id = 'shortcuts-modal';
  modal.classList.add('modal', 'is-active'); // 'is-active' makes it visible immediately

  // 3. Create the Modal Background (Bulma: .modal-background)
  const background = document.createElement('div');
  background.classList.add('modal-background');
  // Close the modal when the background is clicked
  background.onclick = closeShortcutsModal;
  modal.appendChild(background);

  // 4. Create the Modal Content (Bulma: .modal-content)
  const content = document.createElement('div');
  content.classList.add('modal-content', 'box'); // 'box' for a nice background/padding

  // 5. Title
  const title = document.createElement('p');
  title.classList.add('title', 'is-4');
  title.textContent = 'Keyboard Shortcuts';
  content.appendChild(title);

  // 6. Shortcuts Table/List
  const table = document.createElement('table');
  table.classList.add('table', 'is-striped', 'is-fullwidth');

  const tbody = document.createElement('tbody');

  shortcuts.forEach(shortcut => {
    const row = document.createElement('tr');

    // Keys Column
    const keysCell = document.createElement('td');
    // Use the Bulma tag component for a key-like visual
    keysCell.innerHTML = `<span class="tag is-info is-light">${shortcut.keys}</span>`;
    keysCell.style.width = '150px'; // Give the keys column a fixed width
    row.appendChild(keysCell);

    // Description Column
    const descCell = document.createElement('td');
    descCell.textContent = shortcut.description;
    row.appendChild(descCell);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  content.appendChild(table);

  // 7. Append Content to Modal
  modal.appendChild(content);

  // 8. Close Button (Bulma: .modal-close)
  const closeBtn = document.createElement('button');
  closeBtn.classList.add('modal-close', 'is-large');
  closeBtn.setAttribute('aria-label', 'close');
  closeBtn.onclick = closeShortcutsModal;
  modal.appendChild(closeBtn);

  // 9. Append everything to the body
  document.body.appendChild(modal);
}


if (typeof navigator.serviceWorker !== 'undefined') {
  navigator.serviceWorker.register('sw.js')
}
