package de.fh.apps.aigui;

import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

public class JsonFrontendMessagesUtil {
    public static JsonObject createFailedObject(String error) {
        JsonObject jsonObject = createBase("onAnalysisFailed");
        jsonObject.getAsJsonObject("data").add("error", new JsonPrimitive(error));

        return jsonObject;
    }

    public static JsonObject createUpdateObject(String status) {
        JsonObject jsonObject = createBase("onAnalysisUpdate");
        jsonObject.getAsJsonObject("data").add("status", new JsonPrimitive(status));

        return jsonObject;
    }

    public static JsonObject createResultObject(String topicName, JsonObject topicData) {
        JsonObject jsonObject = createBase("onAnalysisResult");

        JsonObject dataJsonObject = jsonObject.getAsJsonObject("data");
        dataJsonObject.add("topicName", new JsonPrimitive(topicName));
        dataJsonObject.add("topicData", topicData);

        return jsonObject;
    }

    private static JsonObject createBase(String action) {
        JsonObject jsonObject = new JsonObject();
        jsonObject.add("action", new JsonPrimitive(action));

        JsonObject dataJsonObject = new JsonObject();
        jsonObject.add("data", dataJsonObject);

        return jsonObject;
    }
}
