package de.fh.apps.aigui;

import org.aeonbits.owner.ConfigFactory;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import spark.Spark;

import java.io.File;
import java.util.Arrays;
import java.util.Properties;

public class Main {
    private static final Logger LOGGER = LoggerFactory.getLogger(Main.class);

    public static void main(String[] args) throws Exception {
        //Load configuration.
        Configuration configuration = ConfigFactory.create(Configuration.class);

        //Setup Kafka connections.
        Properties kafkaProducerProperties = new Properties();
        kafkaProducerProperties.put("client.id", configuration.kafkaClientId());
        kafkaProducerProperties.put("bootstrap.servers", configuration.kafkaBootstrapServers());
        kafkaProducerProperties.put("acks", "all");
        kafkaProducerProperties.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        kafkaProducerProperties.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");

        KafkaProducer<String, String> kafkaProducer = new KafkaProducer<>(kafkaProducerProperties);

        Properties kafkaConsumerProperties = new Properties();
        kafkaConsumerProperties.put("client.id", configuration.kafkaClientId());
        kafkaConsumerProperties.put("bootstrap.servers", configuration.kafkaBootstrapServers());
        kafkaConsumerProperties.put("group.id", configuration.kafkaGroupId());
        kafkaConsumerProperties.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
        kafkaConsumerProperties.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");

        KafkaConsumer<String, String> kafkaConsumer = new KafkaConsumer<>(kafkaConsumerProperties);
        kafkaConsumer.subscribe(Arrays.asList(configuration.kafkaConsumerTopics()));

        if(configuration.aiguiEnableDebuggingInfo())
            LOGGER.info("Configured topics: {}", Arrays.toString(configuration.kafkaConsumerTopics()));

        //Configure message broker.
        KafkaWebSocketsHandler kafkaWebSocketsHandler = new KafkaWebSocketsHandler(kafkaProducer, configuration);
        Spark.webSocket(configuration.websocketsUriPath(), kafkaWebSocketsHandler);

        KafkaConsumerWrapper kafkaConsumerWrapper = new KafkaConsumerWrapper(kafkaConsumer, kafkaWebSocketsHandler);
        kafkaConsumerWrapper.start();

        //Configure server.
        Spark.port(configuration.port());
        Spark.threadPool(configuration.maxThreads());

        File staticFilesDirectory = new File(configuration.staticResourcesPath());

        if(!staticFilesDirectory.isDirectory())
            throw new Exception("Invalid static files directory: \"" + staticFilesDirectory.getAbsolutePath() + "\".");

        Spark.externalStaticFileLocation(staticFilesDirectory.getAbsolutePath());

        Spark.exception(Exception.class, (exception, request, response) -> {
            LOGGER.error("An unexpected error occurred. Request: \"" + request.uri() + "\".", exception);
        });

        //Await server.
        Spark.init();
        Spark.awaitInitialization();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            kafkaWebSocketsHandler.shutdown();

            try {
                kafkaConsumerWrapper.stop();
            }
            catch (InterruptedException exception) {
                LOGGER.error("Unable to stop Kafka consumer (wrapper) properly.", exception);
            }

            try {
                kafkaProducer.close();
                kafkaConsumer.close();
            }
            catch (Exception exception) {
                LOGGER.error("Unable to stop Kafka components properly.", exception);
            }

            Spark.stop();
        }));

        System.out.println("Press RETURN to stop.");
        System.in.read();

        System.exit(0);
    }
}
