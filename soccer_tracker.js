// Global variables
const videoUpload = document.getElementById('videoUpload');
const processBtn = document.getElementById('processBtn');
const status = document.getElementById('status');
const videoPlayer = document.getElementById('videoPlayer');
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');
let videoLoaded = false;
let processing = false;

// Called when OpenCV.js is ready
function onOpenCvReady() {
    status.innerHTML = 'OpenCV.js가 준비되었습니다. 처리할 동영상을 선택하세요.';
    processBtn.disabled = false;
}

// Event Listeners
videoUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        videoPlayer.src = url;
        videoPlayer.onloadedmetadata = () => {
            canvas.width = videoPlayer.videoWidth;
            canvas.height = videoPlayer.videoHeight;
            videoLoaded = true;
            status.innerHTML = '동영상이 로드되었습니다. "영상 처리 시작" 버튼을 누르세요.';
            ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
        };
    }
});

processBtn.addEventListener('click', () => {
    if (!videoLoaded) {
        status.innerHTML = '먼저 동영상을 업로드해주세요.';
        return;
    }
    if (processing) return;

    processing = true;
    status.innerHTML = '영상 처리 중...';
    videoPlayer.play();
    requestAnimationFrame(processFrame);
});

function processFrame() {
    if (!processing || videoPlayer.paused || videoPlayer.ended) {
        processing = false;
        status.innerHTML = '영상 처리가 완료되었습니다.';
        return;
    }

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
        return;
    }

    // Loop
    requestAnimationFrame(processFrame);
}
