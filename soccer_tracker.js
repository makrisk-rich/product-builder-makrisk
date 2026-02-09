// Global variables
const videoUpload = document.getElementById('videoUpload');
const processBtn = document.getElementById('processBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const status = document.getElementById('status');
const progressPercent = document.getElementById('progressPercent');
const trackingStatus = document.getElementById('trackingStatus');
const videoPlayer = document.getElementById('videoPlayer');
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');
let videoLoaded = false;
let processing = false;

let mediaRecorder;
let recordedChunks = [];
let stream;

// Called when OpenCV.js is ready
function onOpenCvReady() {
    console.log('OpenCV.js loaded successfully.');
    status.textContent = 'OpenCV.js가 준비되었습니다. 처리할 동영상을 선택하세요.';
    trackingStatus.textContent = '';
    processBtn.disabled = false;
    stopBtn.disabled = true;
    downloadBtn.classList.add('disabled-link');
}

// Event Listeners
videoUpload.addEventListener('change', (e) => {
    console.log('Video file selected.');
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        videoPlayer.src = url;
        videoPlayer.onloadedmetadata = () => {
            console.log('Video metadata loaded.');
            canvas.width = videoPlayer.videoWidth;
            canvas.height = videoPlayer.videoHeight;
            videoLoaded = true;
            status.textContent = '동영상이 로드되었습니다. "영상 처리 시작" 버튼을 누르세요.';
            progressPercent.textContent = '';
            trackingStatus.textContent = '';
            ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
            processBtn.disabled = false;
            stopBtn.disabled = true;
            downloadBtn.classList.add('disabled-link');
            downloadBtn.removeAttribute('href');
        };
        videoPlayer.onerror = (err) => {
            console.error('Video loading error:', err);
            status.textContent = '동영상 로드 중 오류가 발생했습니다. 다른 파일을 시도해보세요.';
            trackingStatus.textContent = '추적 상태: 오류';
            videoLoaded = false;
            processBtn.disabled = true;
            stopBtn.disabled = true;
            downloadBtn.classList.add('disabled-link');
        };
    } else {
        status.textContent = '동영상 파일이 선택되지 않았습니다.';
        trackingStatus.textContent = '';
        videoLoaded = false;
        processBtn.disabled = true;
        stopBtn.disabled = true;
        downloadBtn.classList.add('disabled-link');
    }
});

processBtn.addEventListener('click', () => {
    if (!videoLoaded) {
        status.textContent = '먼저 동영상을 업로드해주세요.';
        return;
    }
    if (processing) return;

    console.log('Starting video processing...');
    processing = true;
    status.textContent = '영상 처리 중...';
    trackingStatus.textContent = '추적 상태: 초기화 중...';
    processBtn.disabled = true;
    stopBtn.disabled = false;
    downloadBtn.classList.add('disabled-link');
    recordedChunks = [];
    
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    stream = canvas.captureStream(30);
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

    mediaRecorder.ondataavailable = (event) => {
        console.log('MediaRecorder data available, size:', event.data.size);
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        console.log('Video recording stopped. Chunks recorded:', recordedChunks.length);
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        downloadBtn.href = url;
        downloadBtn.download = 'processed_video.webm';
        downloadBtn.classList.remove('disabled-link');
        status.textContent = '영상 처리가 완료되었습니다. 다운로드 버튼을 누르세요.';
        progressPercent.textContent = '';
        trackingStatus.textContent = '추적 상태: 완료';
        processing = false;
        processBtn.disabled = false;
        stopBtn.disabled = true;
        stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
    videoPlayer.currentTime = 0;
    videoPlayer.play();
    requestAnimationFrame(processFrame);
});

// "일시정지" 버튼은 이제 사실상 "처리 중지"와 동일하게 작동합니다.
stopBtn.addEventListener('click', () => {
    if (processing) {
        console.log('Stopping video processing by user.');
        processing = false; // This will trigger the stop condition in processFrame
        videoPlayer.pause(); // Pause video playback
    }
});

function processFrame() {
    if (!processing || videoPlayer.paused || videoPlayer.ended) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            console.log('Stopping MediaRecorder.');
            mediaRecorder.stop();
        }
        if (!processing) {
             status.textContent = '처리가 중지되었습니다.';
             trackingStatus.textContent = '추적 상태: 중지됨';
        }
        processBtn.disabled = false;
        stopBtn.disabled = true;
        return;
    }

    const currentProgress = Math.floor((videoPlayer.currentTime / videoPlayer.duration) * 100);
    progressPercent.textContent = `( ${currentProgress}% )`;
    
    ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
    
    try {
        let src = cv.imread(canvas);
        let hsv = new cv.Mat();
        let mask = new cv.Mat();
        let circles = new cv.Mat();

        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

        let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 200, 0]);
        let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 50, 255, 255]);
        cv.inRange(hsv, low, high, mask);
        low.delete();
        high.delete();

        let M = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.morphologyEx(mask, mask, cv.MORPH_OPEN, M);
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, M);
        M.delete();

        // --- DEBUG: Show the mask directly ---
        cv.imshow('videoCanvas', mask);
        trackingStatus.textContent = '마스크 표시 중... (공이 흰색으로 보여야 함)';
        console.log('Showing color mask. Check if the ball appears as a white blob.');
        // --- END DEBUG ---

        // Clean up memory
        src.delete(); hsv.delete(); mask.delete(); circles.delete();

    } catch (err) {
        console.error(err);
        status.textContent = '오류 발생: ' + err.message;
        trackingStatus.textContent = '추적 상태: 오류 발생';
        processing = false;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        return;
    }

    requestAnimationFrame(processFrame);
}