// Global variables
const videoUpload = document.getElementById('videoUpload');
const processBtn = document.getElementById('processBtn');
const downloadBtn = document.getElementById('downloadBtn');
const status = document.getElementById('status');
const progressPercent = document.getElementById('progressPercent');
const videoPlayer = document.getElementById('videoPlayer');
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');
let videoLoaded = false;
let processing = false;

let mediaRecorder;
let recordedChunks = [];
let stream; // To hold the MediaStream from canvas

// Called when OpenCV.js is ready
function onOpenCvReady() {
    console.log('OpenCV.js loaded successfully.'); // Added log
    status.innerHTML = 'OpenCV.js가 준비되었습니다. 처리할 동영상을 선택하세요.';
    processBtn.disabled = false;
    downloadBtn.disabled = true; // Disable download button initially
}

// Event Listeners
videoUpload.addEventListener('change', (e) => {
    console.log('Video file selected.'); // Added log
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        videoPlayer.src = url;
        videoPlayer.onloadedmetadata = () => {
            console.log('Video metadata loaded.'); // Added log
            canvas.width = videoPlayer.videoWidth;
            canvas.height = videoPlayer.videoHeight;
            videoLoaded = true;
            status.innerHTML = '동영상이 로드되었습니다. "영상 처리 시작" 버튼을 누르세요.';
            progressPercent.textContent = ''; // Clear progress text
            ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
            processBtn.disabled = false; // Ensure process button is enabled after video loads
            downloadBtn.disabled = true; // Disable download if new video is loaded
        };
        videoPlayer.onerror = (err) => { // Added error handler for video player
            console.error('Video loading error:', err);
            status.innerHTML = '동영상 로드 중 오류가 발생했습니다. 다른 파일을 시도해보세요.';
            videoLoaded = false;
            processBtn.disabled = true;
            downloadBtn.disabled = true;
        };
    } else {
        status.innerHTML = '동영상 파일이 선택되지 않았습니다.';
        videoLoaded = false;
        processBtn.disabled = true;
        downloadBtn.disabled = true;
    }
});

processBtn.addEventListener('click', () => {
    if (!videoLoaded) {
        status.innerHTML = '먼저 동영상을 업로드해주세요.';
        return;
    }
    if (processing) return;

    console.log('Starting video processing...'); // Added log
    processing = true;
    status.innerHTML = '영상 처리 중...';
    downloadBtn.disabled = true;
    recordedChunks = []; // Clear previous recordings
    
    // Start recording from canvas
    // Ensure the stream is recreated each time to avoid issues after stopping
    if (stream) {
        stream.getTracks().forEach(track => track.stop()); // Stop previous tracks
    }
    stream = canvas.captureStream(30); // 30 FPS
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        console.log('Video recording stopped.'); // Added log
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        downloadBtn.href = url;
        downloadBtn.download = 'processed_video.webm';
        downloadBtn.disabled = false;
        status.innerHTML = '영상 처리가 완료되었습니다. 다운로드 버튼을 누르세요.';
        progressPercent.textContent = '';
        processing = false;
        // Clean up stream tracks
        stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start();
    videoPlayer.currentTime = 0; // Reset video to start
    videoPlayer.play();
    requestAnimationFrame(processFrame);
});

downloadBtn.addEventListener('click', () => {
    // This listener is mainly for activating the download attribute
    // The href and download properties are set during mediaRecorder.onstop
});

function processFrame() {
    if (!processing || videoPlayer.paused || videoPlayer.ended) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop(); // Stop recording when video ends or processing stops
        }
        return;
    }

    // Update progress percentage
    const currentProgress = Math.floor((videoPlayer.currentTime / videoPlayer.duration) * 100);
    progressPercent.textContent = `(${currentProgress}%)`;
    
    // Draw video frame to canvas
    ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
    
    try {
        let src = cv.imread(canvas);
        let hsv = new cv.Mat();
        let mask = new cv.Mat();
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();

        // Convert to HSV color space
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

        // Define color range for a white soccer ball
        // This may need tuning for different lighting conditions
        let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 200, 0]);
        let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 50, 255, 255]);
        cv.inRange(hsv, low, high, mask);

        // Morphological operations to remove noise
        let M = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.morphologyEx(mask, mask, cv.MORPH_OPEN, M);
        cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, M);
        M.delete();

        // Find contours
        cv.findContours(mask, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

        let bestFit = null;
        let maxArea = 0;

        // Iterate through contours to find the best candidate for the ball
        for (let i = 0; i < contours.size(); ++i) {
            let cnt = contours.get(i);
            let area = cv.contourArea(cnt, false);
            let perimeter = cv.arcLength(cnt, true);
            let circularity = (4 * Math.PI * area) / (perimeter * perimeter);

            // Filter by area and circularity
            if (circularity > 0.6 && area > 100 && area > maxArea) {
                // You might need to adjust area thresholds based on video resolution
                let circle = cv.minEnclosingCircle(cnt);
                if (circle.radius > 5) { // Further filter by radius
                    maxArea = area;
                    bestFit = circle;
                }
            }
            cnt.delete();
        }

        // If a ball is found, draw a circle around it
        if (bestFit) {
            let point = bestFit.center;
            let radius = bestFit.radius;
            let color = new cv.Scalar(255, 0, 0, 255); // Blue circle
            cv.circle(src, point, radius, color, 2);
        }
        
        cv.imshow('videoCanvas', src); // Show the result on canvas

        // Clean up
        src.delete(); hsv.delete(); mask.delete(); contours.delete(); hierarchy.delete(); low.delete(); high.delete();

    } catch (err) {
        console.error(err);
        status.innerHTML = '오류 발생: ' + err.message;
        processing = false;
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        return;
    }

    // Loop
    requestAnimationFrame(processFrame);
}