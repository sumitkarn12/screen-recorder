const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const stopBtn = document.getElementById('stop-btn');
const recorderEl = document.querySelector('#main-content .recorder');
const msg = document.getElementById('msg');
const videoPlayback = document.getElementById('video-playback');
const historyContainer = document.getElementById('recordings');
const cancelRecordingCardSelection = document.getElementById('cancel-recording-selection');
const modal = document.querySelector('#playback-modal');
const multiDeleteBtn = document.querySelector('#delete-multiple-button');
const multiRenameBtn = document.querySelector('#rename-multiple-button');
const recordingCardTypeEl = document.querySelector('#recording-card-type');
const orderByEl = document.querySelector('#order-by-el');
const isReversedEl = document.querySelector('#is-reversed-val');
const template = Handlebars.compile(document.querySelector('#recording-card-template').innerHTML);
const templateWithoutImage = Handlebars.compile(document.querySelector('#recording-card-template-without-image').innerHTML);

const VIEW = { isReversed: true, orderBy: "at", templateType: "with-image" }
const APP_CONFIG_KEY = "config";
const HISTORY_KEY = `RECORDINGS`;
const VIDEO_EXT = `webm`;
const DEF_OF_NEW_RECORDING = 5 * 60 * 1000; // Not recorded more than 5 mins ago 
const APP_URL = location.hostname;
const parser = new DOMParser();

alertify.defaults.glossary.title = "🖥️";
alertify.defaults.notifier.closeButton = true;
alertify.set("notifier", "position", "top-center");

let mediaRecorder, stream;
let recordedChunks = [];
let currentRecording = null;

const db = new Dexie(HISTORY_KEY);
db.version(1).stores({ recordings: `++id, title, blob, at` });
db.version(2).stores({ recordings: "++id, title, blob, at, duration, dimension" });
db.version(3).stores({ recordings: "++id, title, blob, size, at, duration, dimension" });

async function estimateStorage() {
  let details = "Storage Estimation API Not Supported.";
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const { usage, quota } = await navigator.storage.estimate();
    const percentUsed = (usage / quota * 100).toFixed(2);
    const usageInMb = ((usage / (1024 * 1024))).toFixed(2);
    const quotaInMb = ((quota / (1024 * 1024))).toFixed(2);
    details = `${usageInMb} out of ${quotaInMb} MB used (${percentUsed}%)`;
  }
  return details;
}

function updateControls(start_shown = 1, pause_shown = 0, resume_shown = 0, stop_shown = 0) {
  timer.el.style.display = (!start_shown) ? "block" : "none";
  startBtn.style.display = start_shown ? "block" : "none";
  pauseBtn.style.display = pause_shown ? "block" : "none";
  resumeBtn.style.display = resume_shown ? "block" : "none";
  stopBtn.style.display = stop_shown ? "block" : "none";
  recorderEl.style.height = stop_shown ? "100dvh" : "auto";
}

function createElement(nodeName, classes, textContent) {
  const el = document.createElement(nodeName);
  classes.forEach(c => {
    el.classList.add(c);
  });
  el.innerHTML = textContent;
  return el;
}

function saveRecording(mimeType) {
  timer.stop();
  timer.el.style.display = "none";
  const blob = new Blob(recordedChunks, { type: mimeType });
  recordedChunks = [];
  const videoURL = URL.createObjectURL(blob);

  let v = document.createElement("video");
  v.addEventListener("loadeddata", ev => {
    let recordedAt = new Date();
    db.recordings.add({
      "blob": blob,
      "size": blob.size,
      "at": recordedAt,
      "title": `${APP_URL}-${recordedAt.toLocaleString("en-GB").replaceAll(/\W/gi, '')}.${VIDEO_EXT}`,
      "duration": Math.round(v.duration), // In seconds
      "dimension": v.videoWidth + "x" + v.videoHeight
    }).then(a => {
      renderHistory();
      v.remove();
      URL.revokeObjectURL(videoURL);
    });
    // Stop the media stream tracks
    stream.getTracks().forEach(track => track.stop());
    updateControls(1, 0, 0, 0);
  });
  v.src = videoURL;
}

function closeModal() {
  document.querySelectorAll(".modal").forEach(el => el.classList.remove("is-active"));
  videoPlayback.pause();
}

function rename(keys, callback) {
  db.recordings.orderBy("id").filter(r => keys.includes(r.id)).toArray().then(recs => {
    if (recs.length == 0) throw new Error("Nothing to be renamed");
    alertify.prompt(`Enter new name`, (recs.length == 1) ? recs[0].title.replace("." + VIDEO_EXT, "") : "", async function (evt, p) {
      let renamedRecs = recs.map((r, i) => {

        // Check if input is a non-empty string
        if (typeof p !== 'string' || p.length === 0) {
          p = "New Recording"
        }

        p = p.replace(/[^0-9a-zA-Z\-\._]/g, ' ');
        p = p.replace(/\s+/g, ' ').trim(); // Replaced consecutive spaces with one space
        p = p.substring(0, 128);
        r.title = p + ((recs.length > 1) ? ` - ${i}` : "") + `.${VIDEO_EXT}`;
        return r;
      });
      db.recordings.bulkPut(renamedRecs).then(r => {
        alertify.success(`Renamed ${renamedRecs.length} recording${(renamedRecs.length > 1) ? "s" : ""}.`);
        callback(renamedRecs);
      });
    });
  });
}

function remove(keys, callback) {
  alertify.confirm(`Are your sure to delete ${keys.length} recording${(keys.length > 1) ? "s" : ""}?`, async function () {
    db.recordings.bulkDelete(keys).then(r => {
      alertify.success(`Deleted ${keys.length} recording${(keys.length > 1) ? "s" : ""}.`);
      callback(keys);
    });
  });
}

videoPlayback.addEventListener("resize", e => {
  modal.querySelector(".modal-content").style.height = "auto";
  modal.querySelector(".modal-content").style.width = "auto";
  videoPlayback.style.height = "auto";
  videoPlayback.style.width = "auto";
  if ((e.target.videoWidth - e.target.videoHeight) > 0) {
    videoPlayback.style.width = "90%";
    modal.querySelector(".modal-content").style.width = "90%";
  } else {
    videoPlayback.style.height = "90%";
    modal.querySelector(".modal-content").style.height = "90%";
  }
});

recordingCardTypeEl.addEventListener("change", el => {
  VIEW.templateType = el.target.value;
  renderHistory();
});

orderByEl.addEventListener("change", el => {
  VIEW.orderBy = el.target.value;
  renderHistory();
});

isReversedEl.addEventListener("change", el => {
  VIEW.isReversed = el.target.checked;
  renderHistory();
});

cancelRecordingCardSelection.addEventListener("click", e => {
  document.querySelectorAll(".recording-card-selector").forEach(el => {
    el.checked = false;
  });
});

document.querySelectorAll('.modal-close,.modal-background').forEach(el => {
  el.addEventListener("click", closeModal);
});

multiRenameBtn.addEventListener("click", async e => {
  let selectedContent = document.querySelectorAll("#recordings input[type=checkbox]:checked");
  let keys = Array.from(selectedContent).map(c => Number(c.value));
  rename(keys, recs => {
    recs.forEach(r => {
      const title = document.querySelector(`label[data-id='${r.id}'] .rec-title`);
      const download = document.querySelector(`label[data-id='${r.id}'] .download`);
      title.textContent = r.title;
      download.setAttribute("download", r.title);
    });
    cancelRecordingCardSelection.click();
  });
});

multiDeleteBtn.addEventListener("click", async e => {
  let selectedContent = document.querySelectorAll("#recordings input[type=checkbox]:checked");
  let keys = Array.from(selectedContent).map(c => Number(c.value));
  if (keys.length == 0) return;

  remove(keys, ids => {
    ids.forEach(k => {
      const card = document.querySelector(`label[data-id='${k}']`);
      URL.revokeObjectURL(card.querySelector(".download").href);
      card.style.transform = "scale(0)";
      setTimeout(() => card.remove(), 500);
    });
  });
});

startBtn.addEventListener('click', async () => {
  try {
    // Request access to the user's screen
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

    // Set up the MediaRecorder
    mediaRecorder = new MediaRecorder(stream, { mimeType: `video/${VIDEO_EXT}; codecs=vp9` });

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
    if (err.message.toLowerCase() != "permission denied by user") {
      console.error(err)
      alertify.error(`Couldn't start recording.\n${err.message}`, 10);
    }
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
    timer.start(false);
  }
});

stopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  // stopping & hiding timer code is in the saveRecording function
});

historyContainer.addEventListener("click", e => {
  let button = e.target.closest(".card-footer-item");
  if (!button) return;

  if (button.classList.contains("del")) {
    videoPlayback.src = null;
    remove([Number(button.dataset.id)], keys => {
      keys.forEach(k => {
        const card = document.querySelector(`label[data-id='${k}']`);
        URL.revokeObjectURL(card.querySelector(".download").href);
        card.style.transform = "scale(0)";
        setTimeout(() => card.remove(), 500);
      });
    });
  } else if (button.classList.contains("rename")) {
    rename([Number(button.dataset.id)], recs => {
      recs.forEach(r => {
        const title = document.querySelector(`label[data-id='${r.id}'] .rec-title`);
        const download = document.querySelector(`label[data-id='${r.id}'] .download`);
        title.textContent = r.title;
        download.setAttribute( "download", r.title );
      });
    });
  } else if (button.classList.contains("preview")) {
    db.recordings.get(Number(button.dataset.id)).then(data => {
      currentRecording = data;
      videoPlayback.src = document.querySelector(`.download[data-id='${button.dataset.id}']`).href;
      modal.classList.add("is-active");
    });
  }
});

document.addEventListener("keydown", e => {
  // List of tag names to exclude
  const excludedTags = ['INPUT', 'TEXTAREA', 'SELECT'];
  // If the event originated from an excluded input field, do nothing.
  if (excludedTags.includes(e.target.tagName)) return;

  const shortcuts = [
    { keys: '?', description: 'Show all keyboard shortcuts (this popup)' },
    { keys: 'S', description: 'Start/Stop recording' },
    { keys: 'P', description: 'Pause recording' },
    { keys: 'R', description: 'Resume recording' },
    { keys: 'Ctrl + A', description: 'Select all recording cards' },
    { keys: 'Backspace', description: 'Delete selected recording cards' },
    { keys: 'Esc', description: 'Close any active modal / Cancel card selection' }
  ];

  e.preventDefault();

  const pressedKey = String(e.key).toLowerCase();
  const mediaState = mediaRecorder?.state || "inactive";

  console.log(pressedKey, mediaState);

  if (pressedKey === '?') {
    document.getElementById('shortcuts-modal').classList.add("is-active");
  } else if (pressedKey == 's' && mediaState == "inactive") { startBtn.click(); }
  else if (pressedKey == 's' && mediaState == "recording") { stopBtn.click(); }
  else if (pressedKey == "p" && mediaState == "recording") { pauseBtn.click(); }
  else if (pressedKey == "r" && mediaState == "paused") { resumeBtn.click(); }
  else if ((e.ctrlKey || e.metaKey) && pressedKey == 'a') {
    document.querySelectorAll(".recording-card-selector").forEach(el => {
      el.checked = true;
    });
  } else if (pressedKey == "backspace" || pressedKey == "delete") { multiDeleteBtn.click(); }
  else if (pressedKey == "r") { multiRenameBtn.click(); }
  else if (pressedKey == 'escape') {
    closeModal();
    cancelRecordingCardSelection.click();
  }
});

function renderHistory() {
  let recording_header_text = null, innerHTML = [];
  historyContainer.querySelectorAll(".column").forEach(l => l.remove());

  let localDB = db.recordings.orderBy(VIEW.orderBy);
  localDB = VIEW.isReversed ? localDB.reverse() : localDB;

  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(VIEW));

  localDB.each(data => {
    data.poster = `https://picsum.photos/seed/${data.id}/450/150.webp`;
    data.downloadURL = URL.createObjectURL(data.blob);
    data.size = data.size?(data.size / (1024 * 1024)).toFixed(2) + " MB":null;
    data.time = data.at.toLocaleTimeString(navigator.language);
    let d = new Date(data.duration * 1000);
    data.durationAsTime = d.toJSON().substring(11, 19)
    let htv = ( VIEW.orderBy == "at" )?data.at.toDateString(): data[ VIEW.orderBy ];
    if (recording_header_text != htv && (VIEW.orderBy == "at" || VIEW.orderBy == "dimension") ) {
      recording_header_text = htv;
      innerHTML.push( `<div class="category column is-full"><span class="icon"><i class="fa fa-calendar"></i></span> <span>${recording_header_text}</span></div>` );
    }

    data.isNew = ((Date.now() - data.at.getTime()) < DEF_OF_NEW_RECORDING)
    let tempText = (VIEW.templateType == "with-image") ? template(data) : templateWithoutImage(data);
    innerHTML.push( tempText );
  }).then( () => {
    historyContainer.innerHTML = innerHTML.join("");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

const timer = {
  el: document.querySelector("#main-content .timer"),
  t: null,
  s: 0,
  start: function (reset = true) {
    if (reset) this.s = 0;
    clearInterval(this.t)
    this.t = setInterval(() => {
      this.el.textContent = (new Date(++this.s * 1000)).toJSON().substring(11, 19)
    }, 1000);
  },
  stop: function () {
    clearInterval(this.t);
  }
}

let config = JSON.parse(localStorage.getItem(APP_CONFIG_KEY));
Object.keys(config).forEach(key => {
  if (key == "isReversed") {
    isReversedEl.checked = config[key];
  } else if (key == "templateType") {
    recordingCardTypeEl.value = config[key];
  } else if (key == "orderBy") {
    orderByEl.value = config[key];
  }
  VIEW[key] = config[key];
});

if (!navigator.mediaDevices.getDisplayMedia) {
  document.querySelector("#main-content").style.display = "none";
  msg.innerText = "Your browser does not support screen recording feature.";
  msg.parentNode.classList.add("is-danger");
} else {
  // Auto refresh available storage
  setInterval(async () => {
    msg.style.display = "block";
    let m = await estimateStorage()
    if (msg.textContent != m) {
      // alertify.message( `Available storage updated.` );
      msg.textContent = m;
    }
    // console.log( "Available storage checked!" );
  }, 10 * 1000);
  estimateStorage().then(m => {
    msg.style.display = "block";
    msg.textContent = m;
  });
}

if (typeof navigator.serviceWorker !== 'undefined') {
  navigator.serviceWorker.register('sw.js')
}

document.addEventListener( "DOMContentLoaded", renderHistory );

const pageHitCountURL = `https://pagehit.deno.dev/count/${location.hostname}`
console.log( pageHitCountURL )
fetch( pageHitCountURL, {method: "POST"}).then( res => res.json() ).then( res => {
  document.querySelector("#page-hit-count").textContent = res.count;
});