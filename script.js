const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const stopBtn = document.getElementById('stop-btn');
const msg = document.getElementById('msg');
const videoPlayback = document.getElementById('video-playback');
const historyContainer = document.getElementById('history');

const HISOTY_KEY = `RECORDINGS`;

const db = new Dexie( HISOTY_KEY );
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

let mediaRecorder;
let recordedChunks = [];
let stream;

startBtn.addEventListener('click', async () => {
  try {
    // Request access to the user's screen
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    // Set up the MediaRecorder
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm; codecs=vp9'
    });

    // Listen for data chunks and push them into the array
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    // When the recording stops, create a video Blob and a download link
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
      recordedChunks = [];
      const videoURL = URL.createObjectURL(blob);


      videoPlayback.src = videoURL;
      videoPlayback.style.display = 'block';

      let recordedAt = new Date();

      db.recordings.add({
        "blob": blob,
        "at": recordedAt,
        "title": `record.idkey.in-${dateFormatter.format(new Date()).replaceAll(/\W/gi, '-')}.webm`
      }).then( a => { renderHistory() });

      // Stop the media stream tracks
      stream.getTracks().forEach(track => track.stop());
    };

    // Start the recording
    mediaRecorder.start();

    startBtn.style.display = "none";
    pauseBtn.style.display = "block";
    resumeBtn.style.display = "none";
    stopBtn.style.display = "block";

    // Update UI state
    showToast('Recording started...');
    videoPlayback.style.display = 'none';
  } catch (err) {
    console.error("Error: " + err);
    showToast("Error: Could not start recording." );
    startBtn.style.display = "blokc";
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "none";
    stopBtn.style.display = "none";
  }
});

pauseBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state == 'recording') {
    mediaRecorder.pause();
    showToast("Paused");
    startBtn.style.display = "none";
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "block";
    stopBtn.style.display = "block";
  }
});

resumeBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state == 'paused') {
    mediaRecorder.resume();
    showToast("Resumed");
    startBtn.style.display = "none";
    pauseBtn.style.display = "block";
    resumeBtn.style.display = "none";
    stopBtn.style.display = "block";
  }
});

stopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    showToast("Stopped");
    startBtn.style.display = "block";
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "none";
    stopBtn.style.display = "none";
  }
});

function renderHistory() {
  historyContainer.querySelectorAll("li").forEach( l => l.remove() );

  db.recordings.orderBy("at").reverse().each( data => {
    let li = document.createElement( "li" );
    let a = document.createElement( "a" );
    let del = document.createElement( "button" );
    del.classList.add("del", "button");
    del.textContent = "X";
    del.addEventListener("click", async r => {
      r.preventDefault();
      if ( confirm( "Are you sure to delete this?" ) ) {
        await db.recordings.delete( data.id );
        renderHistory();
      }
    });

    a.href = URL.createObjectURL( data.blob );
    a.download = data.title;
    a.innerText = `${dateFormatter.format( data.at )}\n${(data.blob.size/1024).toFixed(2)}KB`;

    let preview = document.createElement("button");
    preview.classList.add("preview", "button");
    preview.textContent = "👀";
    preview.addEventListener("click", async r => {
      r.preventDefault();
      videoPlayback.src = a.href;
    });

    li.appendChild( a );
    li.appendChild( preview );
    li.appendChild( del );
    historyContainer.appendChild( li );

    if ( !videoPlayback.src ) {
      videoPlayback.src = a.href;
      videoPlayback.style.display = 'block'
    }
  });

  historyContainer.style.display = 'block';
}

renderHistory();

if ( !navigator.mediaDevices.getDisplayMedia ) {
  document.querySelector(".controls").style.display = "none";
  msg.style.display = "block";
  msg.innerText = "Your browser does not support screen recording feature.";
} else {
  msg.style.display = "none";
}