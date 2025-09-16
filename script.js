const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
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
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
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
      startBtn.disabled = false;
      stopBtn.disabled = true;
    };

    // Start the recording
    mediaRecorder.start();

    // Update UI state
    startBtn.disabled = true;
    stopBtn.disabled = false;
    showToast('Recording started...');
    videoPlayback.style.display = 'none';
    downloadLink.style.display = 'none';
  } catch (err) {
    console.error("Error: " + err);
    showToast("Error: Could not start recording. Please ensure your browser supports the API and you are on a secure connection (HTTPS or localhost).");
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
});

stopBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
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
      await db.recordings.delete( data.id );
      renderHistory();
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
