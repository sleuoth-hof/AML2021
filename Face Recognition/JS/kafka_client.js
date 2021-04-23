//#region Face Identification setup
console.log('Starting face identification...')

console.log('Loading models...')
var faceapi = require('face-api.js')
Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromDisk('/models'),
    faceapi.nets.faceLandmark68Net.loadFromDisk('/models'),
    faceapi.nets.faceRecognitionNet.loadFromDisk('/models'),
    faceapi.nets.faceExpressionNet.loadFromDisk('/models'),
    faceapi.nets.ssdMobilenetv1.loadFromDisk('/models')
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
    brokers: ['ec2-3-80-52-188.compute-1.amazonaws.com:9092']
})

const producer = kafka.producer()
const consumer = kafka.consumer({ groupId: 'faceident-group' })

const run = async () => {
    await producer.connect()
    // The outgoing message to the gui
    // containing the name of the person identified + original box boundaries received from object detection
    await producer.send({
        topic: 'gui-response',
        messages: [{
            key: 'test-key',
            value: JSON.stringify(
                {
                    id: 'test-id',
                    //object box identifying image
                    objectBox: [12, 44, 23, 64],
                    associatedName: 'Alfred'
                }
            )
        }]
    })

    // Consuming
    await consumer.connect()

    //subscribe to face identification messages i.e "recognize this face!"
    await consumer.subscribe({ topic: 'face-identification', fromBeginning: true })

    //subscribe to face registration to recognize later
    await consumer.subscribe({ topic: 'register-face', fromBeginning: true })

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            if (topic == 'register-face') {
                var img = atob(message.image);

                registerFace(img)
            }
            else if (topic == 'face-identification') {
                var img = atob(message.image);
                //const labeledFaceDescriptors = loadLabeledImages();
                //const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
                recognize(img)
            }

            console.log({
                partition,
                offset: message.offset,
                value: message.value.toString(),
            })
        },
    })
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
function registerFace(name, image) {
    var fs = require('fs');
    var dir = `./labeled_images/${name}`;

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
    fs.writeFile(dir + '1.jpg', image, function (err) {
        if (err) {
            throw err
        }
        console.log(`Registered facial image for ${name}`)
    });
}


/**
 * execute face identification
 *  -apply faceapi
 *  -send back name and box
 * @param image Binary image in jpg format
 */
async function recognize(image) {
    //TODO: Send to faceapi
}

var faceapi = require('face-api.js')
async function loadLabeledImages(names) {
    console.log("Loading labeled images...")
    const labels = getDirectories('./labeled_images');
    return Promise.all(
        labels.map(async label => {
            const descriptions = []
            for (let i = 1; i < 2; i++) {
                const img = await faceapi.fetchImage(`/labeled_images/${label}/${i}.jpg`)
                const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
                descriptions.push(detections.descriptor)
            }
            console.log("Done! Labeled Images Loaded")
            return new faceapi.LabeledFaceDescriptors(label, descriptions)
        })
    )
}

function getDirectories(path) {
    var fs = require('fs')
    return fs.readdirSync(path).filter(function (file) {
        return fs.statSync(path + '/' + file).isDirectory();
    });
}