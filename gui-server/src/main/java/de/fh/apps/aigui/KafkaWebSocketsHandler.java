package de.fh.apps.aigui;

import com.google.gson.*;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.eclipse.jetty.websocket.api.Session;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketClose;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketConnect;
import org.eclipse.jetty.websocket.api.annotations.OnWebSocketMessage;
import org.eclipse.jetty.websocket.api.annotations.WebSocket;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.Base64;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

@WebSocket
public class KafkaWebSocketsHandler implements KafkaConsumerWrapper.ConsumerCallback {
    private static final Logger LOGGER = LoggerFactory.getLogger(KafkaWebSocketsHandler.class);

    private static final ConcurrentHashMap<Session, String> sessionUuidMap = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, Session> uuidSessionMap = new ConcurrentHashMap<>();
    private static final Queue<Session> sessions = new ConcurrentLinkedQueue<>();

    public static Queue<Session> getSessions() {
        return sessions;
    }

    public static ConcurrentHashMap<Session, String> getSessionUuidMap() {
        return sessionUuidMap;
    }

    public static ConcurrentHashMap<String, Session> getUuidSessionMap() {
        return uuidSessionMap;
    }

    private volatile boolean isActive = true;

    private final KafkaProducer<String, String> kafkaProducer;
    private final Configuration configuration;

    public KafkaWebSocketsHandler(KafkaProducer<String, String> kafkaProducer, Configuration configuration) {
        this.kafkaProducer = kafkaProducer;
        this.configuration = configuration;
    }

    public synchronized boolean isActive() {
        return isActive;
    }

    public synchronized void shutdown() {
        isActive = false;

        for(Session tmpSession : sessions)
            tmpSession.close();
    }

    @OnWebSocketConnect
    public void connected(Session session) {
        if(!isActive)
            session.close();

        UUID uuid = UUID.randomUUID();
        String uuidString = uuid.toString();

        LOGGER.info("Generated new UUID: {}", uuidString);

        sessionUuidMap.put(session, uuidString);
        uuidSessionMap.put(uuidString, session);
        sessions.add(session);

        session.getPolicy().setMaxTextMessageSize(configuration.websocketsMaxMessageSize());
    }

    @OnWebSocketClose
    public void closed(Session session, int statusCode, String reason) {
        String uuid = sessionUuidMap.get(session);

        if(uuid != null) {
            sessionUuidMap.remove(session);
            uuidSessionMap.remove(uuid);
            sessions.remove(session);
        }
    }

    @OnWebSocketMessage
    public void message(Session session, String message) throws IOException {
        String errorString = null;

        try {
            JsonObject requestObject = JsonParser.parseString(message).getAsJsonObject();
            String actionString = requestObject.getAsJsonPrimitive("action").getAsString();

            String uuid = sessionUuidMap.get(session);

            if("startNewAnalysis".equals(actionString)) {
                startNewAnalysis(requestObject, uuid);
                session.getRemote().sendString(JsonFrontendMessagesUtil.createUpdateObject("Sent image for analysis.").toString());
            }
            else {
                throw new Exception("Unable to recognize action \"" + actionString + "\".");
            }
        }
        catch (IllegalStateException illegalStateException) {
            errorString = "Unable to process received JSON string (not a JSON object): " + illegalStateException;
        }
        catch (JsonSyntaxException syntaxException) {
            errorString = "Unable to parse received JSON string (no JSON element): " + syntaxException;
        }
        catch (Exception exception) {
            errorString = "Unable to process message. Cause: " + exception;
        }

        if(errorString != null)
            session.getRemote().sendString(JsonFrontendMessagesUtil.createFailedObject(errorString).toString());
    }

    private void startNewAnalysis(JsonObject requestObject, String uuid) throws IOException {
        JsonObject requestDataObject = requestObject.getAsJsonObject("data");

        //Convert image to compressed JPEG.
        String base64ImageString = requestDataObject.getAsJsonPrimitive("image").getAsString();
        byte[] imageData = Base64.getDecoder().decode(base64ImageString);

        BufferedImage bufferedImage = ImageIO.read(new ByteArrayInputStream(imageData));
        BufferedImage bufferedImageCopy = new BufferedImage(bufferedImage.getWidth(), bufferedImage.getHeight(), BufferedImage.TYPE_INT_RGB);

        //Workaround to process transparent images.
        Graphics2D graphics2D = bufferedImageCopy.createGraphics();
        graphics2D.setColor(Color.WHITE); //Replace transparent areas.
        graphics2D.fillRect(0, 0, bufferedImageCopy.getWidth(), bufferedImageCopy.getHeight());
        graphics2D.drawImage(bufferedImage, 0, 0, null);
        graphics2D.dispose();

        ByteArrayOutputStream jpegDataStream = new ByteArrayOutputStream();

        ImageOutputStream imageOutputStream = ImageIO.createImageOutputStream(jpegDataStream);
        ImageWriter jpgImageWriter = ImageIO.getImageWritersByFormatName("jpg").next();

        ImageWriteParam jpgWriteParam = jpgImageWriter.getDefaultWriteParam();
        jpgWriteParam.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        jpgWriteParam.setCompressionQuality(configuration.aiguiJpegCompression());

        jpgImageWriter.setOutput(imageOutputStream);
        jpgImageWriter.write(null, new IIOImage(bufferedImageCopy, null, null), jpgWriteParam);
        jpgImageWriter.dispose();

        byte[] newJpegData = jpegDataStream.toByteArray();
        base64ImageString = Base64.getEncoder().encodeToString(newJpegData);

        //Send data to object detection.
        JsonObject jsonObject = new JsonObject();
        jsonObject.add("id", new JsonPrimitive(uuid));
        jsonObject.add("image", new JsonPrimitive(base64ImageString));

        kafkaProducer.send(new ProducerRecord<>(configuration.kafkaObjectDetectionTopic(), jsonObject.toString()));
    }

    @Override
    public void onRecordsReceived(ConsumerRecords<String, String> consumerRecords) {
        if(isActive) {
            if(configuration.aiguiEnableDebuggingInfo())
                LOGGER.info("Received multiple records. Count: {}", consumerRecords.count());

            for(ConsumerRecord<String, String> tmpRecord : consumerRecords) {
                if(!isActive)
                    break;

                if(configuration.aiguiEnableDebuggingInfo())
                    LOGGER.info("Processed record: {}", tmpRecord);

                String topicName = tmpRecord.topic();
                String rawRecordValue = tmpRecord.value();

                try {
                    JsonObject jsonObject = JsonParser.parseString(rawRecordValue).getAsJsonObject();

                    if(jsonObject.has("id")) {
                        String uuid = jsonObject.getAsJsonPrimitive("id").toString()
                                .replace("\"", ""); //Workaround because of wrong external formatting.

                        if(configuration.aiguiEnableDebuggingInfo())
                            LOGGER.info("Received UUID: {}", uuid);

                        Session session = uuidSessionMap.get(uuid);

                        if(session == null) {
                            LOGGER.warn("Unable to process received consumer record (unable to find matching UUID).");
                        }
                        else {
                            session.getRemote().sendString(JsonFrontendMessagesUtil.createResultObject(topicName, jsonObject).toString());
                        }
                    }
                    else {
                        LOGGER.warn("Unable to process received consumer record (missing id-property).");
                    }
                }
                catch (IllegalStateException illegalStateException) {
                    LOGGER.warn("Unable to process received consumer record (not a JSON object).", illegalStateException);
                }
                catch (JsonSyntaxException jsonSyntaxException) {
                    LOGGER.warn("Unable to process received consumer record (not a JSON string).", jsonSyntaxException);
                }
                catch (Exception exception) {
                    LOGGER.error("Unable to process received consumer record.", exception);
                }
            }
        }
    }
}
