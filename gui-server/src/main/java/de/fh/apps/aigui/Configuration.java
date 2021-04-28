package de.fh.apps.aigui;

import org.aeonbits.owner.Config;

@Config.Sources({ "file:" + Configuration.FILENAME})
public interface Configuration extends Config {
    String FILENAME = "configuration.properties";

    @DefaultValue("8182")
    int port();

    @DefaultValue("10")
    int maxThreads();

    @DefaultValue("static")
    String staticResourcesPath();

    @DefaultValue("/websockets")
    String websocketsUriPath();

    @DefaultValue("aigui-client")
    String kafkaClientId();

    @DefaultValue("")
    String kafkaBootstrapServers();

    @DefaultValue("4000000")
    int websocketsMaxMessageSize();

    //@DefaultValue("faces_found, faces_found_detail")
    @DefaultValue("gui-response_emotion, gui-response_face, faces_found")
    String[] kafkaConsumerTopics();

    @DefaultValue("object-detection")
    String kafkaObjectDetectionTopic();

    @DefaultValue("aigui-client-group")
    String kafkaGroupId();

    @DefaultValue("0.7f")
    float aiguiJpegCompression();

    @DefaultValue("true")
    boolean aiguiEnableDebuggingInfo();
}