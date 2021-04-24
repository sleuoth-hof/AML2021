
const faceapi = require('face-api.js');
const fetch = require('node-fetch');
const brokerAddress = 'AWS Server Address';
//#region Face Identification setup
console.log('Starting face identification...')

console.log('Loading models...')

const MODEL_URL = '/models'
Promise.all([
    /*
    faceapi.nets.tinyFaceDetector.loadFromDisk('/models'),
    faceapi.nets.faceLandmarkModel.loadFromDisk('/models'),
    faceapi.nets.faceRecognitionNet.loadFromDisk('/models'),
    faceapi.nets.faceExpressionNet.loadFromDisk('/models'),
    faceapi.nets.ssdMobilenetv1.loadFromDisk('/models')
    */
    faceapi.loadSsdMobilenetv1Model(MODEL_URL),
    faceapi.loadFaceLandmarkModel(MODEL_URL),
    faceapi.loadFaceRecognitionModel(MODEL_URL)
]).then(console.log('Done! Finished loading models.'))

console.log('Setting up...');
//code for face matching setup
//const labeledFaceDescriptors = loadLabeledImages();
//const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
//#endregion 

//#region Kafka Setup
console.log('Starting Kafka server')
const { Kafka } = require('kafkajs')

const kafka = new Kafka({
    clientId: 'face-identification',
    brokers: [brokerAddress]
})

const producer = kafka.producer()
const consumer = kafka.consumer({ groupId: 'group-ident' })

const run = async () => {

    await producer.connect()

    // Consuming
    await consumer.connect()

    //subscribe to face identification messages i.e "recognize this face!"
    await consumer.subscribe({ topic: 'faces-found-detail', fromBeginning: false })

    //subscribe to face registration to recognize later
    await consumer.subscribe({ topic: 'register-face', fromBeginning: false })

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            const msg = JSON.parse(message.value.toString());

            const requestID = msg.id;
            console.log(`request ID: ${requestID}`);

            //Adding new faces to recognize
            if (topic == 'register-face') {
                //decode image from base64 string to binary/jpeg and save it
                console.log(`received Image: ${msg.image.substring(0, 30)}`)
                decode_base64(msg.image, `labeled_images/${msg.name}`, `1.jpg`);
                //OPTIONAL: If face successfully registered, send notification
            }

            //Attempt at identifying already known faces
            else if (topic == 'faces-found-detail') {
                //save img temporarily ion tmp folder
                decode_base64(msg.image_cut_out, 'tmp', '1.jpg');

                var box = msg.objectBox;
                var faceNr = msg.face_nr;
                //const labeledFaceDescriptors = loadLabeledImages();
                //const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);


                const fs = require('fs')
                fs.readFile(path.join(__dirname, 'tmp', '1.jpg'), 'utf8', (err, data) => {
                    if (err) {
                        console.error(err)
                        return
                    }
                    //console.log(data)
                    //start(data);
                    recognize(data)
                })

                // The outgoing message to the gui
                // containing the name of the person identified + original box boundaries received from object detection
                await producer.send({
                    topic: 'gui-response',
                    messages: [{
                        key: 'test-key',
                        value: JSON.stringify(
                            {
                                id: requestID,
                                //object box identifying image
                                objectBox: [12, 44, 23, 64],
                                associatedName: 'Dummy'
                            }
                        )
                    }]
                })
            }
        },
    })
    //#region Request Tests

    //registering new image
    setTimeout(
        function () {
            sendRegisterTest();
        }, 5000);

    //testing face identification
    setTimeout(
        function () {
            sendIdentTest();
        }, 10000);
}

console.log('Kafka service started')

run().catch(console.error)
//#endregion


/**
 * execute face registration
 *  -create folder with specified name
 *  -save image in folder
 * @param name the name of the person
 * @param image image in binary form
 */
/*
function registerFace(name, image) {
    var fs = require('fs');
    var dir = `./labeled_images/${name}`;

    console.log(`New Person: Directory for image: ${dir}`)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    fs.writeFile(dir + '1.jpg', image, function (err) {
        if (err) {
            throw err
        }
        console.log(`Registered facial image for ${name}`)
        //TODO: send "successfully created" to gui via kafka
    });
}*/


/**
 * execute face identification
 *  -apply faceapi
 *  -send back name and box
 * @param image Binary image in jpg format
 */
function recognize(image) {
    var fetch = require('node-fetch')
    const labeledFaceDescriptors = loadLabeledImages()
    console.log(`Labeled Descriptors: ${labeledFaceDescriptors}`);
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6)
    const detections = faceapi.detectAllFaces(image, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceExpressions()
        .withFaceDescriptors()
    console.log(`DETECTED faces: ${detections}`)
    const resizedDetections = faceapi.resizeResults(detections, displaySize)

    const results = resizedDetections.map(d => faceMatcher.findBestMatch(d.descriptor))

    results.forEach((result, i) => {
        const box = resizedDetections[i].detection.box;
        const name = result.toString();
    })
}

//var faceapi = require('face-api.js')
function loadLabeledImages() {
    console.log("Loading labeled images...")
    const labels = getDirectories('./labeled_images');
    return Promise.all(
        labels.map(label => {
            const descriptors = []
            for (let i = 1; i < 2; i++) {
                var fetch = require('node-fetch')
                const img = faceapi.fetchImage(`/labeled_images/${label}/${i}.jpg`)
                /*
                const img = fs.readFile(path.join(__dirname, 'labeled_images', label,  '1.jpg'), function (error, data) {
                    if (error) {
                        throw error;
                    } else {
                        var buf = Buffer.from(data);
                        return buf;
                    }
                });
                */
                const detections = faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                console.log(`Detections: ${JSON.stringify(detections)}`)
                console.log(`Detections.descriptor: ${detections.descriptor}`)
                descriptors.push(detections.descriptor)

            }
            console.log("Done! Labeled Images Loaded")
            return new faceapi.LabeledFaceDescriptors(label, [0.454]/*descriptors*/)
        })
    ).catch(error => {
        console.error(error);
    })
}



//#region IO Section concerning images

/**
 * Used for reading all the available names, further used in the image loading process
 * @param path the directory, whose child directories are listed
 * @returns a list of directories
 */
function getDirectories(path) {
    var fs = require('fs')
    return fs.readdirSync(path).filter(function (file) {
        return fs.statSync(path + '/' + file).isDirectory();
    });
}

var buffer = require('buffer');
var path = require('path');
var fs = require('fs');

function encode_base64(folder, filename) {
    fs.readFile(path.join(__dirname, folder, filename), function (error, data) {
        if (error) {
            throw error;
        } else {
            var buf = Buffer.from(data);
            var base64 = buf.toString('base64');
            return base64;
        }
    });
}

function decode_base64(base64str, folder, filename) {
    var buf = Buffer.from(base64str, 'base64');

    console.log(`Folder: ${folder}`)

    //create subfolder if not exists
    if (!fs.existsSync(path.join(__dirname, folder))) {
        fs.mkdirSync(path.join(__dirname, folder));
    }

    fs.writeFile(path.join(__dirname, folder, filename), buf, function (error) {
        if (error) {
            console.error(error);
            throw error;
        } else {
            return true;
        }
    });
    console.log(`Written Image to disc under ${path.join(__dirname, folder, filename)}`)
}

//#endregion

//#region Testing functions for sending requests
function sendIdentTest() {
    console.log('Starting Ident Test:')
    producer.send({
        topic: 'faces-found-detail',
        messages: [{
            key: 'test-key',
            value: JSON.stringify(
                {
                    id: 'test-id',
                    face_nr: 1,
                    image_cut_out: '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',
                    objectBox: [12, 44, 23, 64]
                }
            )
        }]
    })
}

function sendRegisterTest() {
    console.log('Starting Registering Test...')
    producer.send({
        topic: 'register-face',
        messages: [{
            key: 'test-key',
            value: JSON.stringify(
                {
                    id: 'test-id',
                    image: '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',
                    name: 'Gandhi'
                }
            )
        }]
    })
}
//#endregion