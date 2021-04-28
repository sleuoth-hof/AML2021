package de.fh.apps.aigui;

import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;

import java.time.Duration;

public class KafkaConsumerWrapper implements  Runnable {
    public interface ConsumerCallback {
        void onRecordsReceived(ConsumerRecords<String, String> consumerRecords);
    }

    private final KafkaConsumer<String, String> kafkaConsumer;
    private final ConsumerCallback consumerCallback;

    private volatile boolean isActive = false;
    private volatile boolean isKeepThreadActive = false;

    private Thread consumerThread;

    public KafkaConsumerWrapper(KafkaConsumer<String, String> kafkaConsumer, ConsumerCallback consumerCallback) {
        this.kafkaConsumer = kafkaConsumer;
        this.consumerCallback = consumerCallback;
    }

    public synchronized boolean isActive() {
        return isActive;
    }

    public synchronized void start() {
        if(isActive)
            return;

        isKeepThreadActive = true;

        consumerThread = new Thread(this);
        consumerThread.start();

        isActive = true;
    }

    public synchronized void stop() throws InterruptedException {
        if(!isActive)
            return;

        isKeepThreadActive = false;
        consumerThread.join();

        isActive = false;
    }

    @Override
    public void run() {
        while (isKeepThreadActive) {
            ConsumerRecords<String, String> consumerRecords = kafkaConsumer.poll(Duration.ofMillis(4000));

            if(!consumerRecords.isEmpty()) {
                consumerCallback.onRecordsReceived(consumerRecords);
                kafkaConsumer.commitAsync();
            }
        }
    }
}
