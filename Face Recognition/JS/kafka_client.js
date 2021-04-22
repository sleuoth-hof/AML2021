
console.log('Starting Kafka Server')
const { Kafka } = require('kafkajs')

const kafka = new Kafka({
    clientId: 'face-identification',
    brokers: ['ec2-3-80-52-188.compute-1.amazonaws.com:9092']
})

const producer = kafka.producer()
const consumer = kafka.consumer({ groupId: 'faceident-group' })

const run = async () => {
    // The outgoing message to the gui, containing all names
    await producer.connect()
    await producer.send({
        topic: 'gui-response',
        messages: [{
            key: 'test-key',
            value: JSON.stringify(
                {
                    id: 'test-id',
                    objectBoxes: [{ x: 12, y: 44, width: 23, height: 64 }],
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