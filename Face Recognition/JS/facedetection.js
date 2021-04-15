const video = document.getElementById('video')

Promise.all([    
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    faceapi.nets.faceExpressionNet.loadFromUri('/models'),
    faceapi.nets.ssdMobilenetv1.loadFromUri('/models')
]).then(startVideo)//.then(addListeners)

function startVideo() {
    navigator.getUserMedia(
        { video: {} },
        stream => video.srcObject = stream,
        err => console.error(err)
    )
}

//function addListeners() {
    video.addEventListener('play', async () => {
        console.log('Starting Video...')
        const canvas = faceapi.createCanvasFromMedia(video)
        document.body.append(canvas)
        const displaySize = { width: video.width, height: video.height }
        faceapi.matchDimensions(canvas, displaySize)

        //code for face matching
        const labeledFaceDescriptors = await loadLabeledImages()
        const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6)

        setInterval(async () => {
            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceExpressions()
                .withFaceDescriptors()
            console.log(detections)
            const resizedDetections = faceapi.resizeResults(detections, displaySize)

            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)

            const results = resizedDetections.map(d => faceMatcher.findBestMatch(d.descriptor))

            results.forEach((result, i) => {
                const box = resizedDetections[i].detection.box
                const drawBox = new faceapi.draw.DrawBox(box, { label: result.toString() })
                drawBox.draw(canvas)
            })
            /*
            resizedDetections.forEach(detection => {
                const box = detection.detection.box
                const drawBox = new faceapi.draw.DrawBox(box, { label: 'Face' })
                drawBox.draw(canvas)
            });
            //faceapi.draw.drawDetections(canvas, resizedDetections)
            /* not needed */
            //faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)
            //faceapi.draw.drawFaceExpressions(canvas, resizedDetections)       
        }, 100);
    })
//}

function loadLabeledImages() {
    const labels = ['Kay', 'Prof. Leuoth']
    return Promise.all(
        labels.map(async label => {
            const descriptions = []
            for (let i = 1; i < 2; i++) {
                const img = await faceapi.fetchImage(`/labeled_images/${label}/${i}.jpg`)
                const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
                descriptions.push(detections.descriptor)
            }

            return new faceapi.LabeledFaceDescriptors(label, descriptions)
        })
    )
}

/*
function loadLabeledImages() {
    const labels = ['Kay']
    return Promise.all(
        labels.map(async label => {
            const descriptions = []
            for (let i = 1; i <= 1; i++) {
                const img = await faceapi.fetchImage(`/labeled_images/${label}/${1}.jpg`).withFaceLandmarks().withFaceDescriptors()
                const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
                descriptions.push(detections.descriptor)
            }
            return new faceapi.LabeledFaceDescriptors(label, descriptions)
        })
    )
}
*/