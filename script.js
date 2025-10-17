const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const stopBtn = document.getElementById('stop-btn');
const controlsWrapper = document.querySelector('.controls-wrapper');
const msg = document.getElementById('msg');
const videoPlayback = document.getElementById('video-playback');
const historyContainer = document.getElementById('recordings');
const modal = document.querySelector('#playback-modal');
const multiDeleteBtn = document.querySelector('#delete-multiple button');

const HISOTY_KEY = `RECORDINGS`;

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

  if ( start_shown || resume_shown ) {
    controlsWrapper.classList.remove("extreme-blur-animation");
  } else {
    controlsWrapper.classList.add("extreme-blur-animation");
  }
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

  showToast("Stopped");
  updateControls(1, 0, 0, 0);
}

function closeModal() {
  modal.classList.remove("is-active");
  videoPlayback.pause();
}

document.addEventListener("keyup", e => {
  if(e.keyCode == 27)
    closeModal();
});
document.querySelectorAll('#playback-modal .modal-close, #playback-modal .modal-background').forEach( el => {
  el.addEventListener("click", closeModal );
});

multiDeleteBtn.addEventListener("click", async e => {
  let selectedContent = document.querySelectorAll("input[type=checkbox]:checked");
  let keys = Array.from(selectedContent).map( c => Number(c.value) );
  if ( keys.length && confirm( `Are your sure to delete ${keys.length} recordings?` ) ) {
    let deletedDetails = await db.recordings.bulkDelete( keys );
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

    // Update UI state
    showToast('Recording started...');
  } catch (err) {
    console.error("Error: " + err);
    showToast("Error: Could not start recording.");
    updateControls(1, 0, 0, 0);
  }
});

pauseBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state == 'recording') {
    mediaRecorder.pause();
    showToast("Paused");
    updateControls(0, 0, 1, 1);
  }
});

resumeBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state == 'paused') {
    mediaRecorder.resume();
    showToast("Resumed");
    updateControls(0, 1, 0, 1);
  }
});

stopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
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

    card.appendChild( cardContainer );
    card.appendChild( dropdownContainer );

    let checkbox = createElement( "input", ["is-hidden"] , null);
    checkbox.setAttribute( "type", "checkbox" );
    checkbox.id = data.id;
    checkbox.value = data.id;
    let column = createElement("label", ["column", "is-full-mobile", "is-half-tablet", "is-one-third-desktop", "is-one-quarter-widescreen", "is-one-fifth-fullhd"], null);
    column.setAttribute("for", data.id );
    checkbox.setAttribute( "type", "checkbox" );
    checkbox.id = data.id;
    checkbox.value = data.id;
    column.appendChild( checkbox );
    column.appendChild( card );
    column.dataset.id = data.id;
    historyContainer.appendChild( column );
  });

  historyContainer.style.display = 'flex';
}

renderHistory();

if (!navigator.mediaDevices.getDisplayMedia) {
  document.querySelector(".controls").style.display = "none";
  historyContainer.style.display = "none";
  msg.style.display = "block";
  msg.innerText = "Your browser does not support screen recording feature.";
} else {
  historyContainer.style.display = "flex";
  setInterval(() => {
    msg.style.display = "block";
    estimateStorage().then(m => {
      msg.textContent = m;
    });
  }, 4 * 1000);
}
