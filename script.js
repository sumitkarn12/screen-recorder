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
const template = Handlebars.compile( document.querySelector('#recording-card-template').innerHTML );
const parser = new DOMParser();

alertify.defaults.glossary.title = "👋";
alertify.defaults.notifier.closeButton = true;
alertify.set("notifier", "position", "top-center");

const HISTORY_KEY = `RECORDINGS`;
const DEF_OF_NEW_RECORDING = 5 * 60 * 1000; // Not recorded more than 5 mins ago 

let mediaRecorder, stream;
let recordedChunks = [];
let currentRecording = null;

const db = new Dexie(HISTORY_KEY);
db.version(1).stores({
  recordings: `++id, title, blob, at`,
});

const dateFormatter = new Intl.DateTimeFormat(navigator.language, {
  dateStyle: "medium",
  timeStyle: "short"
});

function updateControls(start_shown = 1, pause_shown = 0, resume_shown = 0, stop_shown = 0) {
  startBtn.style.display = (start_shown) ? "block" : "none";
  pauseBtn.style.display = (pause_shown) ? "block" : "none";
  resumeBtn.style.display = (resume_shown) ? "block" : "none";
  stopBtn.style.display = (stop_shown) ? "block" : "none";

  controlsWrapper.style.height = stop_shown?"100%": "auto";
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
  timer.stop();
  timer.el.style.display = "none";
  const blob = new Blob(recordedChunks, { type: mimeType });
  recordedChunks = [];
  const videoURL = URL.createObjectURL(blob);

  let v = document.createElement("video");
  v.addEventListener("loadeddata", ev => {
    console.log( "LOADEDDATA", ev );
    let recordedAt = new Date();
    db.recordings.add({
      "blob": blob,
      "at": recordedAt,
      "title": `record.idkey.in-${dateFormatter.format(new Date()).replaceAll(/\W/gi, '-')}.webm`,
      "duration": Math.round(v.duration),
      "dimension": v.videoWidth+"x"+v.videoHeight
    }).then(a => {
      renderHistory();
      v.remove();
    });
    // Stop the media stream tracks
    stream.getTracks().forEach(track => track.stop());
    updateControls(1, 0, 0, 0);
  });
  v.src = videoURL;
}

function closeModal() {
  document.querySelectorAll(".modal").forEach( el => el.classList.remove("is-active"));
  videoPlayback.pause();
}

function cancelRecordingCardSelector() {
  document.querySelectorAll(".recording-card-selector").forEach(el => {
    el.checked = false;
  });
}

videoPlayback.addEventListener("resize", e => {
  console.log( "Video Dimensio", e.target.videoWidth, e.target.videoHeight );
  modal.querySelector(".modal-content").style.height = "auto";
  modal.querySelector(".modal-content").style.width = "auto";
  if ( e.target.videoWidth - e.target.videoHeight) {
    modal.querySelector(".modal-content").style.height = "100%";
  } else {
    modal.querySelector(".modal-content").style.height = "100%";
  }
  let isDirty = false;
  if ( !currentRecording.dimension ) {
    currentRecording.dimension = `${e.target.videoWidth}x${e.target.videoHeight}`
    isDirty = true;
  }
  if ( !currentRecording.duration ) {
    currentRecording.duration = Math.round(e.target.duration);
    isDirty = true;
  }
  if ( isDirty )
  db.recordings.put( currentRecording ).then( r => {
    console.log( r, "Record updated" )
  });
})

cancelRecordingCardSelection.addEventListener("click", cancelRecordingCardSelector);

document.querySelectorAll('.modal-close,.modal-background').forEach(el => {
  el.addEventListener("click", closeModal);
});

multiDeleteBtn.addEventListener("click", async e => {
  let selectedContent = document.querySelectorAll("input[type=checkbox]:checked");
  let keys = Array.from(selectedContent).map(c => Number(c.value));
  if ( keys.length == 0 ) return;
  alertify.confirm(`Are your sure to delete ${keys.length} recording${(keys.length>1)?"s":""}?`,async function() {
    await db.recordings.bulkDelete(keys).then( r=> {
      alertify.success(`Deleted ${keys.length} recording${(keys.length > 1) ? "s" : ""}.` );
      renderHistory();
    });
  });
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
    alertify.error( `Couldn't start recording.\n${err.message}` );
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
  // stopping & hiding timer code is in the saveRecording function
});

historyContainer.addEventListener( "click", e => {
  if ( e.target.classList.contains("del")  ) {
    videoPlayback.src = null;
    alertify.confirm("Are you sure to delete this?", async () => {
      await db.recordings.delete( Number(e.target.dataset.id) );
      alertify.success("Deleted!");
      const card = document.querySelector(`label[data-id='${e.target.dataset.id}']`);
      card.style.transform = "scale(0)";
      setTimeout(()=> card.remove(), 500);
    });
  } else if ( e.target.classList.contains("rename")  ) {
    db.recordings.get(Number(e.target.dataset.id)).then( data => {
      let ts = data.title.split(".");
      let t = data.title.replace("." + ts[ts.length - 1], "");

      alertify.prompt("Enter new name", t, async function (evt, p) {
        if (p.trim().length == 0) {
          alertify.error("Title can't be empty.");
        } else {
          p = p.replaceAll(/\W/gi, "-").replaceAll(/-{2,}/gi, "-");
          p = p.substring(0, 128);
          p = p + "." + ts[ts.length - 1];
          await db.recordings.update(data.id, { title: p });
          alertify.success('Renamed to ' + p);
          const title = document.querySelector(`label[data-id='${e.target.dataset.id}'] .rec-title` );
          title.textContent = p;
        }
      });
    });


  } else if ( e.target.classList.contains("preview")  ) {
    db.recordings.get( Number(e.target.dataset.id) ).then( data => {
      currentRecording = data;
      videoPlayback.src = document.querySelector(`.download[data-id='${e.target.dataset.id}']`).href;
      modal.classList.add("is-active");
    });
  }
});

document.addEventListener("keydown", e => {
  // List of tag names to exclude
  const excludedTags = ['INPUT', 'TEXTAREA', 'SELECT'];
  if (excludedTags.includes(e.target.tagName)) {
    // If the event originated from an excluded input field, do nothing.
    return;
  }

  e.preventDefault();

  if (e.ctrlKey)
    console.log(e.keyCode, e.key);

  if (e.key === '?' && e.shiftKey) {
    document.getElementById('shortcuts-modal').classList.add("is-active");
    const shortcuts = [
      { keys: 'Shift + ?', description: 'Show all keyboard shortcuts (this popup)' },
      { keys: 'S', description: 'Start/Stop recording' },
      { keys: 'P', description: 'Pause recording' },
      { keys: 'R', description: 'Resume recording' },
      { keys: 'Ctrl + A', description: 'Select all recording cards' },
      { keys: 'Backspace', description: 'Delete selected recording cards' },
      { keys: 'Esc', description: 'Close any active modal / Cancel card selection' }
    ];
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

function renderHistory() {
  let current_date = null;
  historyContainer.querySelectorAll(".column").forEach(l => l.remove());

  db.recordings.orderBy("at").reverse().each(data => {
    data.poster = `https://picsum.photos/seed/${data.id}/900/300.webp`;
    data.size = (data.blob.size / (1024 * 1024)).toFixed(2)+"MB";
    data.time = data.at.toLocaleTimeString(navigator.language);
    let d = new Date(data.duration * 1000);
    data.durationAsTime = d.toJSON().substring(11, 19)
    if (current_date != data.at.toDateString()) {
      current_date = data.at.toDateString();
      let li = createElement("div", ["category", "column", "is-full"], `🗓️ ${current_date}`);
      historyContainer.appendChild(li);
    }

    let node = parser.parseFromString(template(data), "text/html");
    node = node.querySelector("label");
    node.querySelector(".download").href = URL.createObjectURL( data.blob );

    if ( (Date.now() - data.at.getTime()) < DEF_OF_NEW_RECORDING ) {
      let newTag = createElement("div", ["new-tag"], null);
      node.querySelector(".card-content").appendChild( newTag );
    }

    historyContainer.appendChild( node );
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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

renderHistory();

if (!navigator.mediaDevices.getDisplayMedia) {
  document.querySelector(".controls").style.display = "none";
  document.querySelector("#main-content").style.display = "none";
  msg.innerText = "Your browser does not support screen recording feature.";
} else {
  setInterval( async () => {
    msg.style.display = "block";
    let details = "Storage Estimation API Not Supported";
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const { usage, quota } = await navigator.storage.estimate();
      const percentUsed = (usage / quota * 100).toFixed(2);
      const usageInMb = ((usage / (1024 * 1024))).toFixed(2);
      const quotaInMb = ((quota / (1024 * 1024))).toFixed(2);
      details = `${usageInMb} out of ${quotaInMb} MB used (${percentUsed}%)`;
    }
    msg.textContent = details;
  }, 10);
}

if (typeof navigator.serviceWorker !== 'undefined') {
  navigator.serviceWorker.register('sw.js')
}
