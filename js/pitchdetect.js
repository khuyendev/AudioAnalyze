window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = null;
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var DEBUGCANVAS = null;
var mediaStreamSource = null;
var detectorElem,
    canvasElem,
    waveCanvas,
    pitchElem,
    pithArray,
    duration,
    noteElem,
    detuneElem,
    detuneAmount;

window.onload = function () {
    audioContext = new AudioContext();
    MAX_SIZE = Math.max(4, Math.floor(audioContext.sampleRate / 5000));	// corresponds to a 5kHz signal
    var request = new XMLHttpRequest();
    request.open("GET", "./js/Cut_audio.mp3", true);
    request.responseType = "arraybuffer";
    request.onload = function () {
        audioContext.decodeAudioData(request.response, function (buffer) {
            console.log(buffer)
            theBuffer = buffer;
        });
    }
    request.send();

    detectorElem = document.getElementById("detector");
    canvasElem = document.getElementById("output");
    DEBUGCANVAS = document.getElementById("waveform");
    if (DEBUGCANVAS) {
        waveCanvas = DEBUGCANVAS.getContext("2d");
        waveCanvas.strokeStyle = "black";
        waveCanvas.lineWidth = 1;
    }
    pitchElem = document.getElementById("pitch");
    pithArray = document.getElementById("pithArray");
    duration = document.getElementById("duration");
    noteElem = document.getElementById("note");
    detuneElem = document.getElementById("detune");
    detuneAmount = document.getElementById("detune_amt");

    detectorElem.ondragenter = function () {
        this.classList.add("droptarget");
        return false;
    };
    detectorElem.ondragleave = function () {
        this.classList.remove("droptarget");
        return false;
    };
    detectorElem.ondrop = function (e) {
        this.classList.remove("droptarget");
        e.preventDefault();
        theBuffer = null;

        var reader = new FileReader();
        reader.onload = function (event) {
            audioContext.decodeAudioData(event.target.result, function (buffer) {
                theBuffer = buffer;
            }, function () {
                alert("error loading!");
            });

        };
        reader.onerror = function (event) {
            alert("Error: " + reader.error);
        };
        reader.readAsArrayBuffer(e.dataTransfer.files[0]);
        return false;
    };


}

function error() {
    alert('Stream generation failed.');
}

function getUserMedia(dictionary, callback) {
    try {

        navigator.mediaDevices.getUserMedia(dictionary, callback, error);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
}

function gotStream(stream) {
    console.log("sss")
    // Create an AudioNode from the stream.
    mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Connect it to the destination.
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 8192;
    mediaStreamSource.connect(analyser);
    updatePitch();
}

function toggleOscillator() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop(0);
        sourceNode = null;
        analyser = null;
        isPlaying = false;
        if (!window.cancelAnimationFrame)
            window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame(rafID);
        return "play oscillator";
    }
    sourceNode = audioContext.createOscillator();

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 8192;
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);
    sourceNode.start(0);
    isPlaying = true;
    isLiveInput = false;
    updatePitch();

    return "stop";
}

function toggleLiveInput() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop(0);
        sourceNode = null;
        analyser = null;
        isPlaying = false;
        if (!window.cancelAnimationFrame)
            window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame(rafID);
    }
    getUserMedia(
        {
            "audio": {
                "sampleRate": 44100,
                "sampleSize": 16,
                channelCount: 1
            },
        }, gotStream);
}

var intervalPlayBack = null;

function togglePlayback() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop(0);
        sourceNode = null;
        analyser = null;
        isPlaying = false;
        if (intervalPlayBack) {
            clearInterval(intervalPlayBack)
        }
        if (!window.cancelAnimationFrame)
            window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame(rafID);
        return "start";
    }

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = theBuffer;
    sourceNode.loop = true;

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 8192;
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);
    sourceNode.start(0);
    isPlaying = true;
    isLiveInput = false;
    updatePitch();

    return "stop";
}

var rafID = null;
var tracks = null;
var buflen = 8192;
var buf = new Float32Array(buflen);

var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFromPitch(frequency) {
    var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
}

function frequencyFromNoteNumber(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

function centsOffFromPitch(frequency, note) {
    return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
}

// this is a float version of the algorithm below - but it's not currently used.
/*
function autoCorrelateFloat( buf, sampleRate ) {
	var MIN_SAMPLES = 4;	// corresponds to an 11kHz signal
	var MAX_SAMPLES = 1000; // corresponds to a 44Hz signal
	var SIZE = 1000;
	var best_offset = -1;
	var best_correlation = 0;
	var rms = 0;

	if (buf.length < (SIZE + MAX_SAMPLES - MIN_SAMPLES))
		return -1;  // Not enough data

	for (var i=0;i<SIZE;i++)
		rms += buf[i]*buf[i];
	rms = Math.sqrt(rms/SIZE);

	for (var offset = MIN_SAMPLES; offset <= MAX_SAMPLES; offset++) {
		var correlation = 0;

		for (var i=0; i<SIZE; i++) {
			correlation += Math.abs(buf[i]-buf[i+offset]);
		}
		correlation = 1 - (correlation/SIZE);
		if (correlation > best_correlation) {
			best_correlation = correlation;
			best_offset = offset;
		}
	}
	if ((rms>0.1)&&(best_correlation > 0.1)) {
		console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")");
	}
//	var best_frequency = sampleRate/best_offset;
}
*/

/*var MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.
var GOOD_ENOUGH_CORRELATION = 0.9; // this is the "bar" for how close a correlation needs to be*/
function autoCorrelate(buf, sampleRate) {
    // Implements the ACF2+ algorithm
    var SIZE = buf.length;
    var rms = 0;

    for (var i = 0; i < SIZE; i++) {
        var val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) // not enough signal
        return -1;

    var r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (var i = 0; i < SIZE / 2; i++)
        if (Math.abs(buf[i]) < thres) {
            r1 = i;
            break;
        }
    for (var i = 1; i < SIZE / 2; i++)
        if (Math.abs(buf[SIZE - i]) < thres) {
            r2 = SIZE - i;
            break;
        }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    var c = new Array(SIZE).fill(0);
    for (var i = 0; i < SIZE; i++)
        for (var j = 0; j < SIZE - i; j++)
            c[i] = c[i] + buf[j] * buf[j + i];

    var d = 0;
    while (c[d] > c[d + 1]) d++;
    var maxval = -1, maxpos = -1;
    for (var i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    var T0 = maxpos;

    var x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    a = (x1 + x3 - 2 * x2) / 2;
    b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}

// function autoCorrelate(buf, sampleRate) {
//     var SIZE = buf.length;
//     var MAX_SAMPLES = Math.floor(SIZE / 2);
//     var best_offset = -1;
//     var best_correlation = 0;
//     var rms = 0;
//     var foundGoodCorrelation = false;
//     var correlations = new Array(MAX_SAMPLES);
//
//     for (var i = 0; i < SIZE; i++) {
//         var val = buf[i];
//         rms += val * val;
//     }
//     rms = Math.sqrt(rms / SIZE);
//     if (rms < 0.01) // not enough signal
//         return -1;
//
//     var lastCorrelation = 1;
//     for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
//         var correlation = 0;
//
//         for (var i = 0; i < MAX_SAMPLES; i++) {
//             correlation += Math.abs((buf[i]) - (buf[i + offset]));
//         }
//         correlation = 1 - (correlation / MAX_SAMPLES);
//         correlations[offset] = correlation; // store it, for the tweaking we need to do below.
//         if ((correlation > GOOD_ENOUGH_CORRELATION) && (correlation > lastCorrelation)) {
//             foundGoodCorrelation = true;
//             if (correlation > best_correlation) {
//                 best_correlation = correlation;
//                 best_offset = offset;
//             }
//         } else if (foundGoodCorrelation) {
//             // short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
//             // Now we need to tweak the offset - by interpolating between the values to the left and right of the
//             // best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
//             // we need to do a curve fit on correlations[] around best_offset in order to better determine precise
//             // (anti-aliased) offset.
//
//             // we know best_offset >=1,
//             // since foundGoodCorrelation cannot go to true until the second pass (offset=1), and
//             // we can't drop into this clause until the following pass (else if).
//             var shift = (correlations[best_offset + 1] - correlations[best_offset - 1]) / correlations[best_offset];
//             return sampleRate / (best_offset + (8 * shift));
//         }
//         lastCorrelation = correlation;
//     }
//     if (best_correlation > 0.01) {
//         // console.log("f = " + sampleRate/best_offset + "Hz (rms: " + rms + " confidence: " + best_correlation + ")")
//         return sampleRate / best_offset;
//     }
//     return -1;
// //	var best_frequency = sampleRate/best_offset;
// }

var number = 0;
var valueAtTimeInterval = [];
var valueOutput = [];

function updatePitch(time) {
    var cycles = new Array;
    analyser.getFloatTimeDomainData(buf);
    // output.push(buf)
    var ac = autoCorrelate(buf, audioContext.sampleRate);
    // TODO: Paint confidence meter on canvasElem here.
    if (!intervalPlayBack) {
        intervalPlayBack = setInterval(() => {
            const avg = this.valueAtTimeInterval.reduce((p, c) => p + c, 0) / this.valueAtTimeInterval.length;
            if (avg === -1) {
                var note = noteFromPitch(avg);
                valueOutput.push(parseInt(avg))
                this.pithArray.append((noteStrings[note % 12] || "-") + ",");
                this.duration.innerHTML = (valueOutput.length * 30);
            } else {
                const filterMuted = this.valueAtTimeInterval.filter((item) => {
                    return item !== -1;
                })
                const avg = filterMuted.reduce((p, c) => p + c, 0) / filterMuted.length;
                var note = noteFromPitch(avg);
                valueOutput.push(parseInt(avg))
                this.pithArray.append((noteStrings[note % 12]|| "-") + ",");
                this.duration.innerHTML = (valueOutput.length * 30);
            }

            this.valueAtTimeInterval = [];
        }, 100)
    }
    valueAtTimeInterval.push(ac)
    if (DEBUGCANVAS) {  // This draws the current waveform, useful for debugging
        waveCanvas.clearRect(0, 0, 512, 256);
        waveCanvas.strokeStyle = "red";
        waveCanvas.beginPath();
        waveCanvas.moveTo(0, 0);
        waveCanvas.lineTo(0, 256);
        waveCanvas.moveTo(128, 0);
        waveCanvas.lineTo(128, 256);
        waveCanvas.moveTo(256, 0);
        waveCanvas.lineTo(256, 256);
        waveCanvas.moveTo(384, 0);
        waveCanvas.lineTo(384, 256);
        waveCanvas.moveTo(512, 0);
        waveCanvas.lineTo(512, 256);
        waveCanvas.stroke();
        waveCanvas.strokeStyle = "black";
        waveCanvas.beginPath();
        waveCanvas.moveTo(0, buf[0]);
        for (var i = 1; i < 512; i++) {
            waveCanvas.lineTo(i, 128 + (buf[i] * 128));
        }
        waveCanvas.stroke();
    }
    // output.push(ac)
    console.log("hihi")
    if (ac == -1) {
        detectorElem.className = "vague";
        pitchElem.innerText = "--";
        noteElem.innerText = "-";
        detuneElem.className = "";
        detuneAmount.innerText = "--";
    } else {
        detectorElem.className = "confident";
        pitch = ac;
        pitchElem.innerText = Math.round(pitch);
        var note = noteFromPitch(pitch);

        noteElem.innerHTML = noteStrings[note % 12];
        var detune = centsOffFromPitch(pitch, note);
        if (detune == 0) {
            detuneElem.className = "";
            detuneAmount.innerHTML = "--";
        } else {
            if (detune < 0)
                detuneElem.className = "flat";
            else
                detuneElem.className = "sharp";
            detuneAmount.innerHTML = Math.abs(detune);
        }
    }

    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = window.webkitRequestAnimationFrame;
    rafID = window.requestAnimationFrame(updatePitch);
}
