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


let mediaRecorder;
let recordedChunks = [];
let stream;

function updateControls( start_shown=1, pause_shown=0, resume_shown=0, stop_shown=0 ) {
  startBtn.style.display = (start_shown)?"block":"none";
  pauseBtn.style.display = (pause_shown) ? "block" : "none";
  resumeBtn.style.display = (resume_shown) ? "block" : "none";
  stopBtn.style.display = (stop_shown) ? "block" : "none";
}

async function delRecording( data, liToRemove ) {
  videoPlayback.src = null;
  videoPlayback.style.display = 'none'

  await db.recordings.delete(data.id);
  renderHistory();
}

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

      showToast("Stopped");
      updateControls( 1,0,0,0 );
    };

    // Start the recording
    mediaRecorder.start();

    updateControls( 0, 1, 0, 1);

    // Update UI state
    showToast('Recording started...');
    videoPlayback.style.display = 'none';
  } catch (err) {
    console.error("Error: " + err);
    showToast("Error: Could not start recording." );
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
  historyContainer.querySelectorAll("li").forEach( l => l.remove() );

  let current_date = null;

  db.recordings.orderBy("at").reverse().each( data => {

    if ( current_date != data.at.toDateString() ) {
      current_date = data.at.toDateString();
      let li = document.createElement("li");
      li.style.padding = "12px";
      li.style.fontWeight = "bold";
      li.textContent = `🗓️ ${current_date}`;
      historyContainer.appendChild(li);
    }

    let li = document.createElement( "li" );
    let recTitle = document.createElement( "h3" );
    let timeEl = document.createElement( "p" );
    let size = document.createElement( "p" );
    let a = document.createElement( "a" );
    let del = document.createElement( "button" );
    let preview = document.createElement("button");
    let rename = document.createElement("rename");

    del.textContent = "❌";
    a.textContent = `⬇️`;
    preview.textContent = "👀";
    rename.textContent = "✏️";

    rename.classList.add( "rename", "button" );
    preview.classList.add("preview", "button");
    a.classList.add( "download", "button" );
    del.classList.add("del", "button");
    recTitle.classList.add( "rec-title" );
    size.classList.add( "size" );
    timeEl.classList.add( "time" );

    del.addEventListener("click", async r => {
      r.preventDefault();
      if ( confirm( "Are you sure to delete this?" ) ) {
        await delRecording( data, li );
      }
    });

    a.href = URL.createObjectURL( data.blob );
    a.download = data.title;
    let atAsTime = data.at.toLocaleTimeString('en-US', {
      hour: "2-digit",
      minute: "2-digit"
    });

    recTitle.textContent = `🎬 ${data.title}`;
    timeEl.textContent = `🕣 ${atAsTime}`;
    size.textContent = `📦 ${(data.blob.size / (1024 * 1024)).toFixed(2)}MB`;

    preview.addEventListener("click", async r => {
      r.preventDefault();
      videoPlayback.src = a.href;
      videoPlayback.style.display = 'block';
      window.scrollTo( 0, 0 );
    });

    rename.addEventListener("click", async r => {
      r.preventDefault();
      let ts = data.title.split( "." );
      let t = data.title.replace( "."+ts[ts.length-1], "" );
      let p = prompt( "Enter new name", t );
      if (p.trim().length == 0) {
        showToast( "Title can't be empty." );
      } else {
        p = p.replaceAll( /\W/gi, "-" ).replaceAll(/-{2,}/gi, "-" );
        p = p.substring( 0, 128 );
        p = p + "." + ts[ts.length - 1];
        await db.recordings.update(data.id, { title: p });
        renderHistory();
      }
    });

    li.appendChild( recTitle );
    li.appendChild(timeEl );
    li.appendChild( size );
    li.appendChild( del );
    li.appendChild( rename );
    li.appendChild( a );
    li.appendChild( preview );
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
  historyContainer.style.display = "none";
  msg.style.display = "block";
  msg.innerText = "Your browser does not support screen recording feature.";
} else {
  historyContainer.style.display = "block";
  setInterval( () => {
    msg.style.display = "block";
    estimateStorage().then( m => {
      msg.textContent = m;
    });
  });
}
